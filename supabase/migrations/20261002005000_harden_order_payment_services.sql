-- Harden payment/order service functions and release coupon usage when a payment is rejected.
-- Applied to production on 2026-10-02 before tracking in Git.

create or replace function public.create_store_order_service(
  p_owner_id uuid,
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_shipping_amount numeric default 0,
  p_payment_method text default 'PENDING',
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_order_id uuid; v_order_number text; v_subtotal numeric(12,2):=0; v_discount numeric(12,2):=0; v_total numeric(12,2);
 v_item jsonb; v_product record; v_qty integer; v_coupon record; v_code text;
begin
 if p_owner_id is null then raise exception 'Owner inválido'; end if;
 if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then raise exception 'Carrinho inválido'; end if;
 if p_shipping_amount is null or p_shipping_amount<0 then raise exception 'Frete inválido'; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  v_qty := (v_item->>'quantity')::integer;
  if v_qty is null or v_qty<1 or v_qty>20 then raise exception 'Quantidade inválida'; end if;
  select id,name,price,stock into v_product from public.products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if v_product.stock<v_qty then raise exception 'Estoque insuficiente para %',v_product.name; end if;
  v_subtotal := v_subtotal + (v_product.price*v_qty);
 end loop;
 v_code := upper(trim(coalesce(p_coupon_code,'')));
 if v_code <> '' then
   select * into v_coupon from public.coupons where code=v_code and owner_id=p_owner_id and active=true for update;
   if not found then raise exception 'Cupom inválido'; end if;
   if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception 'Cupom ainda não está disponível'; end if;
   if v_coupon.expires_at is not null and now() >= v_coupon.expires_at then raise exception 'Cupom expirado'; end if;
   if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then raise exception 'Cupom esgotado'; end if;
   if v_subtotal < v_coupon.min_order_amount then raise exception 'Pedido abaixo do valor mínimo para este cupom'; end if;
   if v_coupon.discount_type='PERCENT' then v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
   else v_discount := least(v_subtotal, v_coupon.discount_value); end if;
 end if;
 v_total := greatest(0, v_subtotal - v_discount + p_shipping_amount);
 v_order_number := 'KJ-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into public.orders(owner_id,order_number,customer_name,customer_email,customer_phone,shipping_address,subtotal_amount,shipping_amount,discount_amount,total_amount,payment_method,payment_status,status,stock_reserved)
 values(p_owner_id,v_order_number,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),trim(p_customer->>'phone'),p_shipping,v_subtotal,p_shipping_amount,v_discount,v_total,p_payment_method,'PENDING','PENDING_PAYMENT',true)
 returning id into v_order_id;
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
$function$;

create or replace function public.cancel_order_payment_service(p_order_id uuid,p_payment_status text)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_order public.orders%rowtype; v_redemption record;
begin
 if p_payment_status not in ('REJECTED','CANCELLED') then raise exception 'Status de pagamento inválido'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found or v_order.payment_status <> 'PENDING' then return false; end if;
 if coalesce(v_order.stock_reserved,false) then
   update public.products p set stock=p.stock+oi.quantity,updated_at=now() from public.order_items oi where oi.order_id=p_order_id and oi.product_id=p.id;
 end if;
 select coupon_id into v_redemption from public.coupon_redemptions where order_id=p_order_id for update;
 if found then
   update public.coupons c set used_count=greatest(0,c.used_count-1),updated_at=now() where c.id=v_redemption.coupon_id;
   delete from public.coupon_redemptions where order_id=p_order_id;
 end if;
 update public.orders set payment_status=p_payment_status,status='CANCELLED',stock_reserved=false,updated_at=now() where id=p_order_id;
 insert into public.order_status_history(order_id,status,note) values(p_order_id,'CANCELLED','Pagamento recusado/cancelado pelo Mercado Pago');
 return true;
end;
$function$;

create or replace function public.mark_order_paid_service(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare v_status text;
begin
 select payment_status into v_status from public.orders where id=p_order_id for update;
 if not found or v_status <> 'PENDING' then return false; end if;
 update public.orders set payment_status='PAID',status='PAID',updated_at=now() where id=p_order_id and payment_status='PENDING';
 insert into public.order_status_history(order_id,status,note) values(p_order_id,'PAID','Pagamento aprovado pelo Mercado Pago');
 return true;
end;
$function$;

drop function if exists public.create_store_order_service(uuid,jsonb,jsonb,jsonb,text);
