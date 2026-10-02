create or replace view public.public_product_sales as
select oi.product_id, sum(oi.quantity)::bigint as sold_quantity
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status not in ('CANCELLED','REFUNDED','CANCELED','cancelled','refunded','canceled')
  and o.payment_status in ('PAID','paid','APPROVED','approved')
group by oi.product_id;

alter view public.public_product_sales set (security_invoker = true);
grant select on public.public_product_sales to anon, authenticated;

create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.public_products add column if not exists sold_quantity bigint not null default 0;

update public.public_products pp
set sold_quantity = coalesce(s.sold_quantity,0)
from public.public_product_sales s
where s.product_id = pp.product_id;

create or replace function public.sync_public_product_sales()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.public_products pp
  set sold_quantity = coalesce((select s.sold_quantity from public.public_product_sales s where s.product_id = pp.product_id),0)
  where pp.product_id in (
    select product_id from public.order_items
    where order_id = coalesce(new.order_id, old.order_id)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists order_items_sync_public_sales on public.order_items;
create trigger order_items_sync_public_sales
after insert or update or delete on public.order_items
for each row execute function public.sync_public_product_sales();
