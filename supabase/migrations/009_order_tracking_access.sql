-- 009_order_tracking_access.sql
-- Secure guest access for order tracking. The raw token is never stored.

alter table public.orders
  add column if not exists tracking_token_hash text,
  add column if not exists tracking_token_created_at timestamptz;

create unique index if not exists orders_tracking_token_hash_idx
  on public.orders (tracking_token_hash)
  where tracking_token_hash is not null;

revoke all on public.orders from anon;
revoke all on public.orders from authenticated;
