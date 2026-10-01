-- Prevents two simultaneous checkout requests from creating duplicate
-- Mercado Pago preferences for the same order.
alter table public.orders
  add column if not exists payment_creation_token uuid,
  add column if not exists payment_creation_started_at timestamptz;

create index if not exists idx_orders_payment_creation
  on public.orders(payment_creation_token, payment_creation_started_at)
  where payment_creation_token is not null;
