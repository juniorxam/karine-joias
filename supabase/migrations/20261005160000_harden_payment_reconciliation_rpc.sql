-- Restrict payment reconciliation RPCs to the server-side service role.
-- These functions can change payment state and/or restore reserved stock.
revoke all on function public.mark_order_paid_service(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid_service(uuid) to service_role;

revoke all on function public.cancel_order_payment_service(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order_payment_service(uuid, text) to service_role;
