alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_provider_id text,
  add column if not exists payment_url text;

create index if not exists orders_payment_provider_idx
  on public.orders(payment_provider, payment_provider_id);
