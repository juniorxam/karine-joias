-- Make Mercado Pago refunds idempotent when the manual refund endpoint
-- and the provider webhook arrive at the same time.
create or replace function public.mark_order_refunded_webhook_service(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return false; end if;

  if v_order.payment_status='REFUNDED' or v_order.status='REFUNDED' then
    return true;
  end if;

  if v_order.payment_status<>'PAID' then return false; end if;

  if coalesce(v_order.stock_reserved,false)
     and v_order.status in ('PAID','PROCESSING','READY_TO_SHIP') then
    for v_item in
      select oi.product_id,oi.quantity,p.stock
      from public.order_items oi
      join public.products p on p.id=oi.product_id
      where oi.order_id=p_order_id
      for update
    loop
      update public.products
      set stock=stock+v_item.quantity,updated_at=now()
      where id=v_item.product_id;

      insert into public.stock_movements(
        owner_id,product_id,movement_type,quantity,stock_before,stock_after,reason
      )
      values(
        v_order.owner_id,v_item.product_id,'RETURN',v_item.quantity,
        v_item.stock,v_item.stock+v_item.quantity,
        'Reposição por reembolso do pedido #'||v_order.order_number
      );
    end loop;
  end if;

  update public.orders
  set payment_status='REFUNDED',
      status='REFUNDED',
      stock_reserved=false,
      updated_at=now()
  where id=p_order_id;

  insert into public.cash_entries(
    owner_id,date,type,category,description,amount,order_id,order_entry_type
  )
  values(
    v_order.owner_id,current_date,'Saída','Reembolso',
    'Reembolso pedido #'||v_order.order_number,
    v_order.total_amount,v_order.id,'REFUND'
  )
  on conflict(order_id,order_entry_type) do nothing;

  return true;
end
$$;
