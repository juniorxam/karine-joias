create or replace function public.mark_order_stock_reserved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set stock_reserved = true, updated_at = now()
  where id = new.order_id;
  return new;
end;
$$;

revoke all on function public.mark_order_stock_reserved() from public, anon, authenticated;

create or replace function public.mark_order_paid_service(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select payment_status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_status <> 'PENDING' then
    return false;
  end if;

  update public.orders
  set payment_status='PAID', status='PAID', updated_at=now()
  where id=p_order_id and payment_status='PENDING';

  return true;
end;
$$;

revoke all on function public.mark_order_paid_service(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid_service(uuid) to service_role;
