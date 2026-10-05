-- Link online-order cash movements to their order and make payment/refund bookkeeping idempotent.

alter table public.cash_entries
  add column if not exists order_id uuid references public.orders(id) on delete cascade,
  add column if not exists order_entry_type text;

update public.cash_entries
set order_entry_type='SALE'
where order_id is not null and order_entry_type is null;

alter table public.cash_entries
  drop constraint if exists cash_entries_order_entry_type_check;

alter table public.cash_entries
  add constraint cash_entries_order_entry_type_check
  check (order_entry_type is null or order_entry_type in ('SALE','REFUND'));

create unique index if not exists cash_entries_order_entry_uidx
  on public.cash_entries(order_id, order_entry_type)
  where order_id is not null and order_entry_type is not null;

create index if not exists cash_entries_order_idx
  on public.cash_entries(order_id);

create or replace function public.mark_order_paid_service(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found or v_order.payment_status <> 'PENDING' then
    return false;
  end if;

  update public.orders
  set payment_status='PAID', status='PAID', updated_at=now()
  where id=p_order_id and payment_status='PENDING';

  insert into public.cash_entries(
    owner_id,date,type,category,description,amount,order_id,order_entry_type
  )
  values(
    v_order.owner_id,
    coalesce(v_order.created_at::date, current_date),
    'Entrada',
    'Venda online',
    'Pedido #' || v_order.order_number,
    v_order.total_amount,
    v_order.id,
    'SALE'
  )
  on conflict (order_id, order_entry_type) do nothing;

  insert into public.order_status_history(order_id,status,note)
  values(p_order_id,'PAID','Pagamento aprovado pelo Mercado Pago');

  return true;
end;
$function$;

create or replace function public.mark_order_refunded_webhook_service(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where id=p_order_id
  for update;

  if not found or v_order.payment_status <> 'PAID' then
    return false;
  end if;

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

  insert into public.cash_entries(
    owner_id,date,type,category,description,amount,order_id,order_entry_type
  )
  values(
    v_order.owner_id,
    current_date,
    'Saída',
    'Reembolso',
    'Reembolso pedido #' || v_order.order_number,
    v_order.total_amount,
    v_order.id,
    'REFUND'
  )
  on conflict (order_id, order_entry_type) do nothing;

  insert into public.order_status_history(order_id,status,note)
  values(p_order_id,'REFUNDED','Pagamento reembolsado');

  return true;
end;
$function$;
