create or replace function public.mark_order_refunded_service(
  p_order_id uuid,
  p_owner_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_owner_id is null or p_owner_id <> (select auth.uid()) then
    raise exception 'Usuário não autorizado';
  end if;

  select * into v_order from public.orders
  where id=p_order_id and owner_id=p_owner_id
  for update;

  if not found then return false; end if;
  if v_order.payment_status <> 'PAID' then
    raise exception 'Somente pedidos pagos podem ser reembolsados';
  end if;
  if v_order.status in ('CANCELLED','REFUNDED') then return false; end if;

  if coalesce(v_order.stock_reserved,false)
     and v_order.status in ('PAID','PROCESSING','READY_TO_SHIP') then
    update public.products p
    set stock=p.stock+oi.quantity, updated_at=now()
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id=p.id;
  end if;

  update public.orders
  set payment_status='REFUNDED',
      status='REFUNDED',
      stock_reserved=false,
      updated_at=now()
  where id=p_order_id;

  return true;
end;
$$;

revoke all on function public.mark_order_refunded_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_order_refunded_service(uuid,uuid) to authenticated;
