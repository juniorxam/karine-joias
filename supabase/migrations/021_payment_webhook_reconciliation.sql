-- Keep stock restoration tied to an active reservation only.
-- Once an order is shipped, its stock reservation is released because the
-- product stock was already decremented when the order was created.
create or replace function public.save_order_shipment_service(
  p_order_id uuid,
  p_owner_id uuid,
  p_tracking_code text,
  p_carrier text default null,
  p_service text default null,
  p_tracking_url text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_tracking text;
begin
  if p_owner_id is null or p_owner_id <> (select auth.uid()) then
    raise exception 'Usuário não autorizado';
  end if;
  select * into v_order from public.orders where id=p_order_id and owner_id=p_owner_id for update;
  if not found then return false; end if;
  if v_order.status in ('CANCELLED','REFUNDED','DELIVERED') then
    raise exception 'Não é possível alterar a expedição deste pedido';
  end if;
  v_tracking := nullif(trim(coalesce(p_tracking_code,'')),'');
  if v_order.status='SHIPPED' and v_tracking is null then
    raise exception 'Pedido enviado precisa manter o código de rastreio';
  end if;
  insert into public.shipments(order_id,carrier,service,tracking_code,tracking_url,shipping_status,updated_at)
  values(p_order_id,nullif(trim(coalesce(p_carrier,'')),''),nullif(trim(coalesce(p_service,'')),''),
         v_tracking,nullif(trim(coalesce(p_tracking_url,'')), ''),
         case when v_tracking is null then 'PENDING' else 'POSTED' end,now())
  on conflict(order_id) do update set
    carrier=excluded.carrier,service=excluded.service,tracking_code=excluded.tracking_code,
    tracking_url=excluded.tracking_url,shipping_status=excluded.shipping_status,updated_at=now();
  if v_tracking is not null and v_order.status='READY_TO_SHIP' then
    update public.orders set status='SHIPPED', stock_reserved=false, updated_at=now() where id=p_order_id;
  end if;
  return true;
end;
$$;

create or replace function public.mark_order_refunded_webhook_service(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_status <> 'PAID' then return false; end if;

  if coalesce(v_order.stock_reserved,false) and v_order.status in ('PAID','PROCESSING','READY_TO_SHIP') then
    update public.products p
    set stock=p.stock+oi.quantity, updated_at=now()
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id=p.id;
  end if;

  update public.orders
  set payment_status='REFUNDED', status='REFUNDED', stock_reserved=false, updated_at=now()
  where id=p_order_id;
  return true;
end;
$$;

revoke all on function public.mark_order_refunded_webhook_service(uuid) from public,anon,authenticated;
grant execute on function public.mark_order_refunded_webhook_service(uuid) to service_role;
