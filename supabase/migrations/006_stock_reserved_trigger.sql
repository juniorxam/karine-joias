create or replace function public.mark_order_stock_reserved()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.orders
  set stock_reserved = true,
      updated_at = now()
  where id = new.order_id;
  return new;
end;
$$;

drop trigger if exists order_items_mark_stock_reserved on public.order_items;
create trigger order_items_mark_stock_reserved
after insert on public.order_items
for each row execute function public.mark_order_stock_reserved();
