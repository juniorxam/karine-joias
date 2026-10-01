-- Karine Joias ecommerce core
alter table public.products
  add column if not exists sku text,
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists weight_grams integer not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists weight_grams integer not null default 200,
  add column if not exists package_height_cm numeric(8,2) not null default 5,
  add column if not exists package_width_cm numeric(8,2) not null default 10,
  add column if not exists package_length_cm numeric(8,2) not null default 15;

create unique index if not exists products_owner_sku_idx on public.products(owner_id,sku) where sku is not null;
create unique index if not exists products_owner_slug_idx on public.products(owner_id,slug) where slug is not null;

alter table public.public_products
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists sku text;

create index if not exists public_products_slug_idx on public.public_products(store_slug,slug) where is_published=true;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images(product_id,sort_order);
alter table public.product_images enable row level security;
create policy product_images_owner_all on public.product_images for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy product_images_public_read on public.product_images for select to anon using (exists(select 1 from public.public_products pp where pp.product_id=product_images.product_id and pp.owner_id=product_images.owner_id and pp.is_published=true and pp.store_slug='karine-joias'));

create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 order_number text not null unique,
 customer_name text not null,
 customer_email text not null,
 customer_phone text not null default '',
 shipping_address jsonb not null default '{}'::jsonb,
 subtotal_amount numeric(12,2) not null default 0 check(subtotal_amount>=0),
 shipping_amount numeric(12,2) not null default 0 check(shipping_amount>=0),
 discount_amount numeric(12,2) not null default 0 check(discount_amount>=0),
 total_amount numeric(12,2) not null default 0 check(total_amount>=0),
 payment_method text not null default 'PENDING',
 payment_provider text,
 payment_provider_id text,
 payment_url text,
 payment_status text not null default 'PENDING',
 status text not null default 'PENDING_PAYMENT',
 stock_reserved boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists orders_owner_created_idx on public.orders(owner_id,created_at desc);

create table if not exists public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 product_id bigint not null references public.products(id),
 product_name text not null,
 quantity integer not null check(quantity>0),
 unit_price numeric(12,2) not null check(unit_price>=0),
 total_price numeric(12,2) generated always as (quantity*unit_price) stored
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

create table if not exists public.order_status_history (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 status text not null,
 note text,
 created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 provider text not null,
 provider_event_id text not null,
 event_type text not null,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(provider,provider_event_id)
);
create index if not exists payment_events_order_idx on public.payment_events(order_id);

create table if not exists public.shipments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id) on delete cascade,
 carrier text,
 service text,
 tracking_code text,
 tracking_url text,
 shipping_status text not null default 'PENDING',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payment_events enable row level security;
alter table public.shipments enable row level security;

create policy orders_owner_select on public.orders for select to authenticated using ((select auth.uid())=owner_id);
create policy orders_owner_update on public.orders for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy order_items_owner_select on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));
create policy order_history_owner_select on public.order_status_history for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));
create policy payment_events_owner_select on public.payment_events for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));
create policy shipments_owner_select on public.shipments for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.owner_id=(select auth.uid())));

revoke all on public.orders,public.order_items,public.order_status_history,public.payment_events,public.shipments from anon;
grant select,update on public.orders to authenticated;
grant select on public.order_items,public.order_status_history,public.payment_events,public.shipments to authenticated;
