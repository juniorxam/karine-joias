-- Coupons: server-side validation and atomic usage tracking
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('PERCENT','FIXED')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  check (discount_type <> 'PERCENT' or discount_value <= 100)
);

alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
grant all on public.coupons to service_role;

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  order_id uuid not null references public.orders(id),
  code text not null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);

alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from anon, authenticated;
grant all on public.coupon_redemptions to service_role;

drop function if exists public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text);

create or replace function public.create_store_order_service(
 p_owner_id uuid, p_customer jsonb, p_shipping jsonb, p_items jsonb,
 p_shipping_amount numeric(12,2) default 0,
 p_payment_method text default 'PENDING',
 p_coupon_code text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
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
  select id,name,price,stock into v_product from products
   where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if v_product.stock<v_qty then raise exception 'Estoque insuficiente para %',v_product.name; end if;
  v_subtotal := v_subtotal + (v_product.price*v_qty);
 end loop;

 v_code := upper(trim(coalesce(p_coupon_code,'')));
 if v_code <> '' then
   select * into v_coupon from coupons where code=v_code and active=true for update;
   if not found then raise exception 'Cupom inválido'; end if;
   if v_coupon.starts_at is not null and now() < v_coupon.starts_at then raise exception 'Cupom ainda não está disponível'; end if;
   if v_coupon.expires_at is not null and now() >= v_coupon.expires_at then raise exception 'Cupom expirado'; end if;
   if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then raise exception 'Cupom esgotado'; end if;
   if v_subtotal < v_coupon.min_order_amount then raise exception 'Pedido abaixo do valor mínimo para este cupom'; end if;
   if v_coupon.discount_type='PERCENT' then
     v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
   else
     v_discount := least(v_subtotal, v_coupon.discount_value);
   end if;
 end if;

 v_total := greatest(0, v_subtotal - v_discount + p_shipping_amount);
 v_order_number := 'KJ-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));

 insert into orders(owner_id,order_number,customer_name,customer_email,customer_phone,shipping_address,subtotal_amount,shipping_amount,discount_amount,total_amount,payment_method,payment_status,status,stock_reserved)
 values(p_owner_id,v_order_number,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),trim(p_customer->>'phone'),p_shipping,v_subtotal,p_shipping_amount,v_discount,v_total,p_payment_method,'PENDING','PENDING_PAYMENT',true)
 returning id into v_order_id;

 for v_item in select * from jsonb_array_elements(p_items) loop
  v_qty := (v_item->>'quantity')::integer;
  select id,name,price,stock into v_product from products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
  update products set stock=stock-v_qty,updated_at=now() where id=v_product.id;
  insert into order_items(order_id,product_id,product_name,quantity,unit_price) values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price);
 end loop;

 if v_code <> '' then
   update coupons set used_count=used_count+1, updated_at=now() where id=v_coupon.id;
   insert into coupon_redemptions(coupon_id,order_id,code,discount_amount) values(v_coupon.id,v_order_id,v_code,v_discount);
 end if;

 insert into order_status_history(order_id,status,note) values(v_order_id,'PENDING_PAYMENT','Pedido criado pela loja online');
 return (select jsonb_build_object('id',id,'order_number',order_number,'subtotal_amount',subtotal_amount,'shipping_amount',shipping_amount,'discount_amount',discount_amount,'total_amount',total_amount) from orders where id=v_order_id);
end;
$$;

revoke all on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text) from public,anon,authenticated;
grant execute on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text) to service_role;
