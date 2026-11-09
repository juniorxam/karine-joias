-- Draft only. Do not execute in production before checkout/webhook integration.
-- Customer rewards are derived from server-confirmed payments; no public progress writes.
create table if not exists public.reward_missions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null check (length(title) between 3 and 120),
  description text,
  mode text not null check (mode in ('cumulative','single_order')),
  threshold_amount numeric(12,2) not null check (threshold_amount > 0),
  gift_source text not null default 'custom' check (gift_source in ('custom','catalog')),
  gift_product_id bigint references public.products(id),
  gift_name text not null check (length(gift_name) between 2 and 160),
  gift_description text,
  gift_image_url text,
  gift_stock integer not null default 0 check (gift_stock >= 0),
  check ((gift_source = 'custom' and gift_product_id is null) or (gift_source = 'catalog' and gift_product_id is not null)),
  gift_quantity integer not null default 1 check (gift_quantity between 1 and 100),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  unique (id, owner_id)
);
create table if not exists public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.reward_missions(id),
  customer_user_id uuid not null references auth.users(id),
  qualifying_order_id uuid not null references public.orders(id),
  status text not null default 'reserved' check (status in ('reserved','fulfilled','cancelled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (mission_id, customer_user_id)
);
create index if not exists reward_claims_mission_status_idx on public.reward_claims(mission_id,status);
create index if not exists reward_claims_customer_idx on public.reward_claims(customer_user_id);
create index if not exists reward_missions_owner_idx on public.reward_missions(owner_id,is_active);
alter table public.reward_missions enable row level security;
alter table public.reward_claims enable row level security;
revoke all on public.reward_missions, public.reward_claims from anon, authenticated;
-- Grant only after implementing audited owner-scoped policies and an authenticated
-- server-side claim path. Never trust cart totals or email supplied by a browser.
-- For custom gifts, gift_stock is independent of public.products stock.\n-- Server must lock the correct gift inventory and enforce claim limits atomically.
-- Refunds, cancellation, duplicate webhook delivery and race conditions must be tested.
