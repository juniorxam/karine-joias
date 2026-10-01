create or replace function public.update_order_status_service(
  p_order_id uuid,
  p_owner_id uuid,
  p_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean := false;
begin
  if p_status not in ('PENDING_PAYMENT','PAID','PROCESSING','READY_TO_SHIP','SHIPPED','DELIVERED','CANCELLED','REFUNDED') then
    raise exception 'Status inválido';
  end if;
  select * into v_order from public.orders
  where id=p_order_id and owner_id=p_owner_id for update;
  if not found then return false; end if;
  if v_order.status = p_status then return true; end if;

  v_allowed :=
    (v_order.status='PENDING_PAYMENT' and p_status='CANCELLED')
    or (v_order.status='PAID' and p_status in ('PROCESSING','CANCELLED','REFUNDED'))
    or (v_order.status='PROCESSING' and p_status in ('READY_TO_SHIP','CANCELLED'))
    or (v_order.status='READY_TO_SHIP' and p_status='SHIPPED')
    or (v_order.status='SHIPPED' and p_status='DELIVERED');

  if not v_allowed then raise exception 'Transição de status não permitida'; end if;
  if p_status='PROCESSING' and v_order.payment_status <> 'PAID' then
    raise exception 'Pagamento ainda não confirmado';
  end if;

  update public.orders set status=p_status, updated_at=now() where id=p_order_id;
  return true;
end;
$$;

revoke all on function public.update_order_status_service(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.update_order_status_service(uuid,uuid,text) to authenticated;
