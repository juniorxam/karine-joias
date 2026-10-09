-- Remove the legacy overload whose DEFAULT parameters make PostgREST
-- unable to choose between the 9- and 10-argument order service RPCs.
drop function if exists public.create_store_order_service(
  uuid,
  jsonb,
  jsonb,
  jsonb,
  numeric,
  text,
  text,
  text,
  text
);
