-- Ecommerce shipping quote hardening
create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  postal_code text not null,
  items jsonb not null default '[]'::jsonb,
  destination jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.shipping_quotes enable row level security;
revoke all on public.shipping_quotes from anon, authenticated;
grant all on public.shipping_quotes to service_role;

alter table public.shipments add constraint shipments_order_id_unique unique (order_id);
create policy "owners can insert shipments" on public.shipments for insert to authenticated
with check (exists (select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));
create policy "owners can update shipments" on public.shipments for update to authenticated
using (exists (select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())))
with check (exists (select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));

create policy "owners can insert order history" on public.order_status_history for insert to authenticated
with check (exists (select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));

create or replace function public.record_order_status_history()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history(order_id,status,note) values(new.id,new.status,null);
  end if;
  return new;
end;
$$;
drop trigger if exists orders_status_history_trigger on public.orders;
create trigger orders_status_history_trigger after update of status on public.orders
for each row when (new.status is distinct from old.status)
execute function public.record_order_status_history();

create or replace function public.create_store_order_service(
 p_owner_id uuid, p_customer jsonb, p_shipping jsonb, p_items jsonb,
 p_shipping_amount numeric(12,2) default 0, p_payment_method text default 'PENDING'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order_id uuid; v_order_number text; v_subtotal numeric(12,2):=0; v_total numeric(12,2); v_item jsonb; v_product record; v_qty integer;
begin
 if p_owner_id is null then raise exception 'Owner inválido'; end if;
 if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then raise exception 'Carrinho inválido'; end if;
 if p_shipping_amount is null or p_shipping_amount<0 then raise exception 'Frete inválido'; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  if v_qty is null or v_qty<1 or v_qty>20 then raise exception 'Quantidade inválida'; end if;
  select id,name,price,stock into v_product from products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if v_product.stock<v_qty then raise exception 'Estoque insuficiente para %',v_product.name; end if;
  v_subtotal:=v_subtotal+(v_product.price*v_qty);
 end loop;
 v_total:=v_subtotal+p_shipping_amount;
 v_order_number:='KJ-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
 insert into orders(owner_id,order_number,customer_name,customer_email,customer_phone,shipping_address,subtotal_amount,shipping_amount,total_amount,payment_method,payment_status,status,stock_reserved)
 values(p_owner_id,trim(p_customer->>'name'),lower(trim(p_customer->>'email')),trim(p_customer->>'phone'),p_shipping,v_subtotal,p_shipping_amount,v_total,p_payment_method,'PENDING','PENDING_PAYMENT',true)
 returning id into v_order_id;
 for v_item in select * from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::integer;
  select id,name,price,stock into v_product from products where id=(v_item->>'product_id')::bigint and owner_id=p_owner_id for update;
  update products set stock=stock-v_qty,updated_at=now() where id=v_product.id;
  insert into order_items(order_id,product_id,product_name,quantity,unit_price) values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price);
 end loop;
 insert into order_status_history(order_id,status,note) values(v_order_id,'PENDING_PAYMENT','Pedido criado pela loja online');
 return (select jsonb_build_object('id',id,'order_number',order_number,'total_amount',total_amount,'shipping_amount',shipping_amount) from orders where id=v_order_id);
end;
$$;
revoke all on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text) to service_role;