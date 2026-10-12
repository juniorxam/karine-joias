-- Restrict order-creation RPCs to the trusted create-order Edge Function.
-- The Edge Function uses the service-role client and performs input validation,
-- rate limiting, and optional customer authentication before invoking the RPC.
revoke all on function public.create_store_order_service(uuid, jsonb, jsonb, jsonb, numeric, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_store_order_service(uuid, jsonb, jsonb, jsonb, numeric, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_store_order_service(uuid, jsonb, jsonb, jsonb, numeric, text, text, text, text) to service_role;
grant execute on function public.create_store_order_service(uuid, jsonb, jsonb, jsonb, numeric, text, text, text, text, uuid) to service_role;
