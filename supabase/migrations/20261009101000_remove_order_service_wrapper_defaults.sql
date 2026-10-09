-- The 10-argument wrapper must be explicit. DEFAULT parameters make
-- PostgREST consider it a candidate for 9-argument calls as well.
drop function if exists public.create_store_order_service(
  uuid, jsonb, jsonb, jsonb, numeric, text, text, text, text, uuid
);

create function public.create_store_order_service(
  p_owner_id uuid,
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_shipping_amount numeric,
  p_payment_method text,
  p_coupon_code text,
  p_idempotency_key text,
  p_tracking_token_hash text,
  p_customer_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_order_id uuid;
begin
  v_result := public.create_store_order_service(
    p_owner_id,
    p_customer,
    p_shipping,
    p_items,
    p_shipping_amount,
    p_payment_method,
    p_coupon_code,
    p_idempotency_key,
    p_tracking_token_hash
  );
  if p_customer_user_id is not null then
    v_order_id := (v_result->>'id')::uuid;
    update public.orders
      set customer_user_id = p_customer_user_id, updated_at = now()
    where id = v_order_id
      and customer_user_id is null;
  end if;
  return v_result;
end;
$function$;
