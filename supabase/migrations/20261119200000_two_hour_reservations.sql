-- Preserve the existing checkout RPC entry points and lock coupon usage in the order transaction.
create or replace function private.violetta_phone(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'), '^55([0-9]{10,11})$', '\1');
$$;

create or replace function private.store_coupon_discount(
  p_coupon public.coupons, p_subtotal numeric, p_shipping numeric,
  p_phone text, p_email text, p_cpf text, p_lock boolean
) returns numeric language plpgsql set search_path = '' as $$
declare
  v_phone text := private.violetta_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email,'')));
  v_cpf text := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  v_lead_phone text;
begin
  if p_coupon.id is null or p_coupon.active is distinct from true then raise exception 'Cupom inválido'; end if;
  if p_coupon.starts_at > clock_timestamp() then raise exception 'Cupom ainda não está disponível'; end if;
  if p_coupon.expires_at <= clock_timestamp() then raise exception 'Cupom expirado'; end if;
  if p_coupon.max_uses is not null and p_coupon.used_count >= p_coupon.max_uses then raise exception 'Cupom esgotado'; end if;
  if p_subtotal < p_coupon.min_order_amount then raise exception 'Pedido abaixo do valor mínimo para este cupom'; end if;

  select private.violetta_phone(l.phone) into v_lead_phone
    from public.first_purchase_leads l where l.owner_id=p_coupon.owner_id and l.coupon_id=p_coupon.id;
  if found or p_coupon.code like 'VIOLE10-%' then
    if v_lead_phone is null or v_phone <> v_lead_phone or v_email = '' or length(v_cpf) <> 11 then
      raise exception 'Informe o WhatsApp do cupom, seu e-mail e CPF para validar a primeira compra';
    end if;
    if p_lock then
      -- First-purchase checkouts for this store serialize across different coupon codes.
      perform pg_advisory_xact_lock(hashtextextended('violetta:first-purchase:' || p_coupon.owner_id::text,0));
    end if;
    if exists (
      select 1 from public.orders o
      where o.owner_id=p_coupon.owner_id
        and (o.payment_status in ('PAID','APPROVED','REFUNDED') or o.status='REFUNDED' or
          (o.payment_status='PENDING' and o.status='PENDING_PAYMENT' and exists (
            select 1 from public.coupon_redemptions r
            join public.first_purchase_leads l on l.coupon_id=r.coupon_id and l.owner_id=r.owner_id
            where r.order_id=o.id)))
        and (private.violetta_phone(o.customer_phone)=v_phone or lower(trim(o.customer_email))=v_email
          or regexp_replace(coalesce(o.shipping_address->>'recipient_code',''),'[^0-9]','','g')=v_cpf)
    ) then
      raise exception 'Cupom exclusivo para a primeira compra, sem outro pedido reservado com esse benefício';
    end if;
  end if;

  return case p_coupon.discount_type
    when 'GIFT' then 0
    when 'FREIGHT' then case when p_coupon.discount_value <= 0 then p_shipping else least(p_shipping,p_coupon.discount_value) end
    when 'PERCENT' then least(p_subtotal, round(p_subtotal*p_coupon.discount_value/100,2))
    else least(p_subtotal,p_coupon.discount_value)
  end;
end;
$$;

create or replace function public.preview_store_coupon(
  p_owner_id uuid, p_code text, p_subtotal numeric, p_shipping numeric, p_phone text, p_email text, p_cpf text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_coupon public.coupons%rowtype;
  v_discount numeric;
begin
  select * into v_coupon from public.coupons where owner_id=p_owner_id and code=p_code;
  v_discount := private.store_coupon_discount(v_coupon,p_subtotal,p_shipping,p_phone,p_email,p_cpf,false);
  return jsonb_build_object('valid',true,'code',v_coupon.code,'discount_type',v_coupon.discount_type,
    'discount_value',v_coupon.discount_value,'discount_amount',v_discount,'subtotal',p_subtotal,
    'gift_description',v_coupon.gift_description);
end;
$$;
revoke all on function public.preview_store_coupon(uuid,text,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_store_coupon(uuid,text,numeric,numeric,text,text,text) to service_role;

create or replace function public.create_store_order_service(
  p_owner_id uuid,
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_shipping_amount numeric,
  p_payment_method text,
  p_coupon_code text,
  p_idempotency_key text,
  p_tracking_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_order_number text;
  v_existing public.orders%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2);
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_coupon public.coupons%rowtype;
  v_code text;
  v_redemption_discount numeric(12,2);
begin
  if p_owner_id is null then raise exception 'Owner inválido'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 20 or length(trim(p_idempotency_key)) > 128 then raise exception 'Chave de checkout inválida'; end if;
  if p_tracking_token_hash is null or length(trim(p_tracking_token_hash)) <> 64 then raise exception 'Token de acompanhamento inválido'; end if;
  select * into v_existing from public.orders where owner_id = p_owner_id and checkout_idempotency_key = trim(p_idempotency_key) for update;
  if found then return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'subtotal_amount',v_existing.subtotal_amount,'shipping_amount',v_existing.shipping_amount,'discount_amount',v_existing.discount_amount,'total_amount',v_existing.total_amount,'created_at',v_existing.created_at,'payment_status',v_existing.payment_status,'status',v_existing.status); end if;
  if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then raise exception 'Carrinho inválido'; end if;
  if p_shipping_amount is null or p_shipping_amount < 0 then raise exception 'Frete inválido'; end if;
  if coalesce(length(trim(p_customer->>'name')),0) < 2 or coalesce(length(trim(p_customer->>'name')),0) > 120 then raise exception 'Nome inválido'; end if;
  if lower(trim(coalesce(p_customer->>'email',''))) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'E-mail inválido'; end if;
  if coalesce(length(regexp_replace(p_customer->>'phone','[^0-9]','','g')),0) not between 10 and 13 then raise exception 'Telefone inválido'; end if;
  if coalesce(length(regexp_replace(coalesce(p_customer->>'recipient_code',p_shipping->>'recipient_code'),'[^0-9]','','g')),0) <> 11 then raise exception 'CPF inválido'; end if;
  if coalesce(length(regexp_replace(p_shipping->>'postal_code','[^0-9]','','g')),0) <> 8 then raise exception 'CEP inválido'; end if;
  if coalesce(length(trim(p_shipping->>'address')),0) < 2 or coalesce(length(trim(p_shipping->>'number')),0) < 1 or coalesce(length(trim(p_shipping->>'neighborhood')),0) < 2 or coalesce(length(trim(p_shipping->>'city')),0) < 2 or upper(trim(p_shipping->>'state')) !~ '^[A-Z]{2}$' then raise exception 'Endereço inválido'; end if;
  if (select count(distinct (item->>'product_id')::bigint) from jsonb_array_elements(p_items) item) <> jsonb_array_length(p_items) then
    raise exception 'Produto repetido no carrinho';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) item order by (item->>'product_id')::bigint loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'Quantidade inválida'; end if;
    select id,name,price,stock,active into v_product from public.products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
    if not found then raise exception 'Produto não encontrado'; end if;
    if coalesce(v_product.active,true) = false then raise exception 'Produto não está disponível'; end if;
    if v_product.stock < v_qty then raise exception 'Estoque insuficiente para %',v_product.name; end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;
  v_code := upper(trim(coalesce(p_coupon_code,'')));
  if v_code <> '' then
    select * into v_coupon from public.coupons where code=v_code and owner_id=p_owner_id for update;
    if not found then raise exception 'Cupom inválido'; end if;
    v_discount := private.store_coupon_discount(v_coupon, v_subtotal, p_shipping_amount,
      p_customer->>'phone', p_customer->>'email', p_customer->>'recipient_code', true);
  end if;
  v_redemption_discount := v_discount;
  if v_coupon.discount_type = 'FREIGHT' then
    p_shipping_amount := p_shipping_amount - v_discount;
    v_discount := 0;
  end if;
  v_total := greatest(0, v_subtotal - v_discount + p_shipping_amount);
  v_order_number := 'VIO-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
  begin
    insert into public.orders(owner_id,order_number,checkout_idempotency_key,tracking_token_hash,tracking_token_created_at,customer_name,customer_email,customer_phone,shipping_address,subtotal_amount,shipping_amount,discount_amount,total_amount,payment_method,payment_status,status,stock_reserved)
    values(p_owner_id,v_order_number,trim(p_idempotency_key),trim(p_tracking_token_hash),now(),trim(p_customer->>'name'),lower(trim(p_customer->>'email')),trim(p_customer->>'phone'),p_shipping,v_subtotal,p_shipping_amount,v_discount,v_total,p_payment_method,'PENDING','PENDING_PAYMENT',true)
    returning id into v_order_id;
  exception when unique_violation then
    select * into v_existing from public.orders where owner_id=p_owner_id and checkout_idempotency_key=trim(p_idempotency_key) for update;
    if not found then raise; end if;
    return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'subtotal_amount',v_existing.subtotal_amount,'shipping_amount',v_existing.shipping_amount,'discount_amount',v_existing.discount_amount,'total_amount',v_existing.total_amount,'created_at',v_existing.created_at,'payment_status',v_existing.payment_status,'status',v_existing.status);
  end;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select id,name,price,stock into v_product from public.products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
    update public.products set stock=stock-v_qty,updated_at=now() where id=v_product.id;
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price) values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price);
  end loop;
  if v_code <> '' then
    update public.coupons set used_count=used_count+1,updated_at=now() where id=v_coupon.id;
    insert into public.coupon_redemptions(coupon_id,order_id,owner_id,code,discount_amount) values(v_coupon.id,v_order_id,p_owner_id,v_code,v_redemption_discount);
  end if;
  insert into public.order_status_history(order_id,status,note) values(v_order_id,'PENDING_PAYMENT','Pedido criado pela loja online');
  return (select jsonb_build_object('id',id,'order_number',order_number,'subtotal_amount',subtotal_amount,'shipping_amount',shipping_amount,'discount_amount',discount_amount,'total_amount',total_amount,'created_at',created_at,'payment_status',payment_status,'status',status) from public.orders where id=v_order_id);
end;
$function$;

revoke all on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text,text) to service_role;

-- An expired reservation cannot transition to paid, including through admin and legacy integrations.
create or replace function private.guard_expired_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.payment_status <> 'PAID' and new.payment_status='PAID'
    and (old.payment_status <> 'PENDING' or old.status <> 'PENDING_PAYMENT'
      or old.created_at + interval '2 hours' <= clock_timestamp()) then
    raise exception 'Reserva do pedido expirada' using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger guard_expired_order before update of payment_status on public.orders
  for each row execute function private.guard_expired_order();

create or replace function public.mark_order_paid_service(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_status <> 'PENDING' or v_order.status <> 'PENDING_PAYMENT'
    or v_order.created_at + interval '2 hours' <= clock_timestamp() then return false; end if;
  begin
    update public.orders set payment_status='PAID',status='PAID',updated_at=now() where id=p_order_id;
  exception when check_violation then
    if v_order.created_at + interval '2 hours' <= clock_timestamp() then return false; end if;
    raise;
  end;
  insert into public.cash_entries(owner_id,date,type,category,description,amount,order_id,order_entry_type)
    values(v_order.owner_id,current_date,'Entrada','Venda online','Pedido #'||v_order.order_number,v_order.total_amount,v_order.id,'SALE')
    on conflict(order_id,order_entry_type) do nothing;
  return true;
end;
$$;

-- Restore stock in the same product order used by checkout and write a single cancellation entry.
create or replace function public.cancel_order_payment_service(p_order_id uuid,p_payment_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_coupon_id uuid;
begin
  if p_payment_status is null or p_payment_status not in ('REJECTED','CANCELLED') then
    raise exception 'Status de pagamento inválido';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_status <> 'PENDING' then return false; end if;
  if v_order.stock_reserved then
    for v_item in
      select p.id,p.stock,
        (select sum(oi.quantity)::integer from public.order_items oi
          where oi.order_id=p_order_id and oi.product_id=p.id) as quantity
      from public.products p
      where exists (select 1 from public.order_items oi where oi.order_id=p_order_id and oi.product_id=p.id)
      order by p.id for update of p
    loop
      update public.products set stock=stock+v_item.quantity,updated_at=now() where id=v_item.id;
      insert into public.stock_movements(owner_id,product_id,movement_type,quantity,stock_before,stock_after,reason)
        values(v_order.owner_id,v_item.id,'RETURN',v_item.quantity,v_item.stock,v_item.stock+v_item.quantity,
          'Liberação de estoque do pedido #'||v_order.order_number);
    end loop;
  end if;
  delete from public.coupon_redemptions where order_id=p_order_id returning coupon_id into v_coupon_id;
  if found then
    update public.coupons set used_count=greatest(0,used_count-1),updated_at=now() where id=v_coupon_id;
  end if;
  update public.orders set payment_status=p_payment_status,status='CANCELLED',stock_reserved=false,
    payment_url=null,payment_creation_token=null,payment_creation_started_at=null,updated_at=now() where id=p_order_id;
  return true;
end;
$$;

create or replace function public.record_order_status_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then
    insert into public.order_status_history(order_id,status,note) values(new.id,new.status,'Pedido criado');
  elsif new.status is distinct from old.status then
    insert into public.order_status_history(order_id,status,note) values(new.id,new.status,
      case when new.status='CANCELLED' and old.payment_status='PENDING'
        and old.created_at + interval '2 hours' <= clock_timestamp()
      then 'Reserva de 2 horas encerrada; estoque e cupom liberados' end);
  end if;
  return new;
end;
$$;

create or replace function public.expire_pending_orders_service(p_age_minutes integer default 120)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_order record;
  v_expired integer := 0;
begin
  for v_order in
    select id from public.orders
    where payment_status='PENDING' and status='PENDING_PAYMENT'
      and created_at <= statement_timestamp() - interval '2 hours'
    order by created_at,id limit 50 for update skip locked
  loop
    if public.cancel_order_payment_service(v_order.id,'CANCELLED') then
      v_expired := v_expired + 1;
    end if;
  end loop;
  return v_expired;
end;
$$;

select cron.schedule('violetta-expire-pending-orders','* * * * *',
  $$select public.expire_pending_orders_service(120);$$);

-- Return only public, currently attainable missions for this storefront.
create or replace function public.violetta_cart_gifts()
returns table(id uuid, gift_name text, threshold_amount numeric)
language sql stable security definer set search_path = '' as $$
  select m.id,m.gift_name,m.threshold_amount
  from public.reward_missions m join public.storefront_settings s on s.owner_id=m.owner_id
  left join public.products p on p.id=m.gift_product_id and p.owner_id=m.owner_id and p.active
  where s.store_slug='violetta' and m.mode='single_order' and m.is_active and m.threshold_amount>0
    and (m.starts_at is null or m.starts_at<=now())
    and (m.ends_at is null or m.ends_at>now())
    and (m.gift_product_id is null or p.stock>=m.gift_quantity)
    and (m.gift_stock is null or m.gift_stock>coalesce(m.reserved_gifts,0))
    and (m.max_redemptions is null or m.max_redemptions>(
      select count(*) from public.reward_claims c where c.mission_id=m.id and c.status <> 'cancelled'))
  order by m.threshold_amount,m.id;
$$;
revoke all on function public.violetta_cart_gifts() from public;
grant execute on function public.violetta_cart_gifts() to anon,authenticated;

-- Couple the payment identity to the order transition in the same transaction.
create or replace function public.reconcile_violetta_payment(
  p_order_id uuid, p_provider text, p_transaction_id text, p_method text
) returns text language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_provider is distinct from p_provider then return 'provider_mismatch'; end if;
  if v_order.payment_status='PAID' then
    if v_order.payment_provider_id=p_transaction_id then return 'paid'; end if;
    return 'duplicate_payment_review';
  end if;
  if not public.mark_order_paid_service(p_order_id) then return 'late_payment_review'; end if;
  update public.orders set payment_provider_id=p_transaction_id,payment_method=p_method where id=p_order_id;
  return 'paid';
end;
$$;
revoke all on function public.reconcile_violetta_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_violetta_payment(uuid,text,text,text) to service_role;

-- Issue the coupon and attach it to its normalized phone in a single transaction.
create or replace function public.issue_violetta_first_purchase_coupon(p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_phone text := private.violetta_phone(p_phone);
  v_name text := trim(p_name);
  v_settings public.first_purchase_settings%rowtype;
  v_lead public.first_purchase_leads%rowtype;
  v_coupon public.coupons%rowtype;
  v_existing boolean;
begin
  if v_name is null or length(v_name) not between 2 and 120 or length(v_phone) not between 10 and 11 then
    raise exception 'Informe um nome e WhatsApp válidos';
  end if;
  select owner_id into strict v_owner from public.storefront_settings where store_slug='violetta';
  perform pg_advisory_xact_lock(hashtextextended('violetta:issue-coupon:' || v_owner::text || ':' || v_phone,0));
  select * into v_settings from public.first_purchase_settings where owner_id=v_owner;
  if v_settings.enabled=false then raise exception 'O presente de primeira compra está temporariamente indisponível'; end if;
  if exists (select 1 from public.orders o where o.owner_id=v_owner
      and (o.payment_status in ('PAID','APPROVED','REFUNDED') or o.status='REFUNDED')
      and private.violetta_phone(o.customer_phone)=v_phone) then
    raise exception 'Benefício exclusivo para a primeira compra';
  end if;

  select * into v_lead from public.first_purchase_leads where owner_id=v_owner
    and private.violetta_phone(phone)=v_phone order by (coupon_id is not null) desc,created_at,id limit 1;
  select * into v_coupon from public.coupons where id=v_lead.coupon_id and owner_id=v_owner;
  v_existing := found;
  if v_existing then
    if not v_coupon.active or v_coupon.expires_at <= clock_timestamp() then
      raise exception 'O seu cupom de primeira compra está indisponível ou expirou';
    end if;
  else
    insert into public.coupons(owner_id,code,discount_type,discount_value,min_order_amount,gift_description,starts_at,expires_at,max_uses)
      values(v_owner,'VIOLE10-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
        coalesce(v_settings.reward_type,'PERCENT'),coalesce(v_settings.reward_value,10),
        coalesce(v_settings.min_order_amount,0),v_settings.gift_description,now(),
        now()+make_interval(days=>coalesce(v_settings.validity_days,30)),1)
      returning * into v_coupon;
    if v_lead.id is null then
      insert into public.first_purchase_leads(owner_id,phone,name,coupon_id) values(v_owner,v_phone,v_name,v_coupon.id);
    else
      update public.first_purchase_leads set coupon_id=v_coupon.id where id=v_lead.id;
    end if;
  end if;
  return jsonb_build_object('coupon_code',v_coupon.code,'reward_type',v_coupon.discount_type,
    'reward_value',v_coupon.discount_value,'expires_at',v_coupon.expires_at,
    'gift_description',v_coupon.gift_description,'existing',v_existing);
end;
$$;
revoke all on function public.issue_violetta_first_purchase_coupon(text,text) from public,anon,authenticated;
grant execute on function public.issue_violetta_first_purchase_coupon(text,text) to service_role;

create index if not exists orders_pending_reservation_deadline_idx on public.orders(created_at,id)
  where payment_status='PENDING' and status='PENDING_PAYMENT';
