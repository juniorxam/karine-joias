create or replace function public.cancel_order_payment_service(
  p_order_id uuid,
  p_payment_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_payment_status not in ('REJECTED','CANCELLED') then
    raise exception 'Status de pagamento inválido';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return false; end if;
  if v_order.payment_status <> 'PENDING' then return false; end if;

  if coalesce(v_order.stock_reserved, false) then
    update public.products p
    set stock = p.stock + oi.quantity, updated_at = now()
    from public.order_items oi
    where oi.order_id = p_order_id and oi.product_id = p.id;

    v_order.stock_reserved := false;
  end if;

  update public.orders
  set payment_status = p_payment_status,
      status = 'CANCELLED',
      stock_reserved = false,
      updated_at = now()
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.cancel_order_payment_service(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_order_payment_service(uuid,text) to service_role;
