-- Sincroniza o endurecimento transacional do checkout com o banco de produção.
-- Esta migration registra o estado aplicado no Supabase pela versão transactional_tracking_token.

alter table public.orders
  add column if not exists tracking_token_hash text,
  add column if not exists tracking_token_created_at timestamptz;

create unique index if not exists orders_tracking_token_hash_idx
  on public.orders (tracking_token_hash)
  where tracking_token_hash is not null;

drop function if exists public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text);

CREATE OR REPLACE FUNCTION public.create_store_order_service(p_owner_id uuid, p_customer jsonb, p_shipping jsonb, p_items jsonb, p_shipping_amount numeric DEFAULT 0, p_payment_method text DEFAULT 'PENDING'::text, p_coupon_code text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_tracking_token_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_coupon record;
  v_code text;
begin
  if p_owner_id is null then raise exception 'Owner inválido'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 20 or length(trim(p_idempotency_key)) > 128 then raise exception 'Chave de checkout inválida'; end if;
  if p_tracking_token_hash is null or length(trim(p_tracking_token_hash)) <> 64 then raise exception 'Token de acompanhamento inválido'; end if;
  select * into v_existing from public.orders where owner_id = p_owner_id and checkout_idempotency_key = trim(p_idempotency_key) for update;
  if found then return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'subtotal_amount',v_existing.subtotal_amount,'shipping_amount',v_existing.shipping_amount,'discount_amount',v_existing.discount_amount,'total_amount',v_existing.total_amount); end if;
  if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then raise exception 'Carrinho inválido'; end if;
  if p_shipping_amount is null or p_shipping_amount < 0 then raise exception 'Frete inválido'; end if;
  if coalesce(length(trim(p_customer->>'name')),0) < 2 or coalesce(length(trim(p_customer->>'name')),0) > 120 then raise exception 'Nome inválido'; end if;
  if lower(trim(coalesce(p_customer->>'email',''))) !~ '^\\S+@\\S+\\.\\S+$' then raise exception 'E-mail inválido'; end if;
  if coalesce(length(regexp_replace(p_customer->>'phone','\\D','','g')),0) not between 10 and 13 then raise exception 'Telefone inválido'; end if;
  if coalesce(length(regexp_replace(coalesce(p_customer->>'recipient_code',p_shipping->>'recipient_code'),'\\D','','g')),0) <> 11 then raise exception 'CPF inválido'; end if;
  if coalesce(length(regexp_replace(p_shipping->>'postal_code','\\D','','g')),0) <> 8 then raise exception 'CEP inválido'; end if;
  if coalesce(length(trim(p_shipping->>'address')),0) < 2 or coalesce(length(trim(p_shipping->>'number')),0) < 1 or coalesce(length(trim(p_shipping->>'neighborhood')),0) < 2 or coalesce(length(trim(p_shipping->>'city')),0) < 2 or upper(trim(p_shipping->>'state')) !~ '^[A-Z]{2}$' then raise exception 'Endereço inválido'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
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
    select * into v_coupon from public.coupons where code=v_code and owner_id=p_owner_id and active=true for update;
    if not found then raise exception 'Cupom inválido'; end if;
    if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception 'Cupom ainda não está disponível'; end if;
    if v_coupon.expires_at is not null and now() >= v_coupon.expires_at then raise exception 'Cupom expirado'; end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then raise exception 'Cupom esgotado'; end if;
    if v_subtotal < v_coupon.min_order_amount then raise exception 'Pedido abaixo do valor mínimo para este cupom'; end if;
    if v_coupon.discount_type='PERCENT' then v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2); else v_discount := least(v_subtotal, v_coupon.discount_value); end if;
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
    return jsonb_build_object('id',v_existing.id,'order_number',v_existing.order_number,'subtotal_amount',v_existing.subtotal_amount,'shipping_amount',v_existing.shipping_amount,'discount_amount',v_existing.discount_amount,'total_amount',v_existing.total_amount);
  end;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select id,name,price,stock into v_product from public.products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
    update public.products set stock=stock-v_qty,updated_at=now() where id=v_product.id;
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price) values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price);
  end loop;
  if v_code <> '' then
    update public.coupons set used_count=used_count+1,updated_at=now() where id=v_coupon.id;
    insert into public.coupon_redemptions(coupon_id,order_id,owner_id,code,discount_amount) values(v_coupon.id,v_order_id,p_owner_id,v_code,v_discount);
  end if;
  insert into public.order_status_history(order_id,status,note) values(v_order_id,'PENDING_PAYMENT','Pedido criado pela loja online');
  return (select jsonb_build_object('id',id,'order_number',order_number,'subtotal_amount',subtotal_amount,'shipping_amount',shipping_amount,'discount_amount',discount_amount,'total_amount',total_amount) from public.orders where id=v_order_id);
end;
$function$


revoke all on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text,text) to service_role;
