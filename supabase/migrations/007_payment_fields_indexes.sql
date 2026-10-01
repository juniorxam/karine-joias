alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_provider_id text,
  add column if not exists payment_url text;

create index if not exists order_items_product_idx on public.order_items(product_id);
create index if not exists payment_events_order_idx on public.payment_events(order_id);
