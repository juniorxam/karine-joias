-- Permite que o cliente autenticado acompanhe seus próprios pedidos
-- sem conceder acesso aos pedidos de outros clientes.
alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_customer_created_idx
  on public.orders(customer_user_id, created_at desc)
  where customer_user_id is not null;

drop policy if exists orders_customer_select on public.orders;
create policy orders_customer_select on public.orders
  for select to authenticated
  using ((select auth.uid()) = customer_user_id);

drop policy if exists order_items_customer_select on public.order_items;
create policy order_items_customer_select on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.customer_user_id = (select auth.uid())
  ));

drop policy if exists order_history_customer_select on public.order_status_history;
create policy order_history_customer_select on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_status_history.order_id
      and o.customer_user_id = (select auth.uid())
  ));

drop policy if exists shipments_customer_select on public.shipments;
create policy shipments_customer_select on public.shipments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = shipments.order_id
      and o.customer_user_id = (select auth.uid())
  ));

-- Pedido sem pagamento permanece disponível por 24 horas. O cron roda a cada
-- 10 minutos, portanto a expiração ocorrerá no primeiro ciclo após esse prazo.
create or replace function public.expire_pending_orders_service(p_age_minutes integer default 1440)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order record;
  v_redemption record;
  v_expired integer := 0;
begin
  for v_order in
    select id from public.orders
    where payment_status = 'PENDING'
      and status = 'PENDING_PAYMENT'
      and stock_reserved = true
      and created_at < now() - make_interval(mins => greatest(5, coalesce(p_age_minutes, 1440)))
    for update skip locked
  loop
    update public.products p
      set stock = p.stock + oi.quantity, updated_at = now()
    from public.order_items oi
    where oi.order_id = v_order.id and oi.product_id = p.id;

    select coupon_id into v_redemption
      from public.coupon_redemptions
      where order_id = v_order.id
      for update;
    if found then
      update public.coupons
        set used_count = greatest(0, used_count - 1), updated_at = now()
        where id = v_redemption.coupon_id;
      delete from public.coupon_redemptions where order_id = v_order.id;
    end if;

    update public.orders
      set payment_status = 'CANCELLED', status = 'CANCELLED', stock_reserved = false, updated_at = now()
      where id = v_order.id and payment_status = 'PENDING';
    if found then
      insert into public.order_status_history(order_id, status, note)
        values(v_order.id, 'CANCELLED', 'Pedido expirado após 24 horas sem pagamento; estoque e cupom liberados');
      v_expired := v_expired + 1;
    end if;
  end loop;
  return v_expired;
end;
$function$;

revoke all on function public.expire_pending_orders_service(integer) from public, anon, authenticated;
grant execute on function public.expire_pending_orders_service(integer) to service_role;

create extension if not exists pg_cron;
select cron.unschedule(jobid)
  from cron.job
  where jobname = 'violetta-expire-pending-orders';
select cron.schedule(
  'violetta-expire-pending-orders',
  '*/10 * * * *',
  $$select public.expire_pending_orders_service(1440);$$
);
