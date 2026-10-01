alter table public.orders
  add column if not exists stock_reserved boolean not null default false;

create or replace function public.restore_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved boolean;
begin
  select stock_reserved into v_reserved
  from public.orders
  where id = p_order_id
  for update;

  if coalesce(v_reserved, false) then
    update public.products p
    set stock = p.stock + oi.quantity,
        updated_at = now()
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.product_id = p.id;

    update public.orders
    set stock_reserved = false,
        updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

revoke execute on function public.restore_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.restore_order_stock(uuid) to service_role;
