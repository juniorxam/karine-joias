create table if not exists public.public_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null,
  store_slug text not null default 'karine-joias',
  name text not null,
  category text not null,
  material text not null default '',
  price numeric(12,2) not null default 0,
  image_url text,
  featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, product_id)
);

create index if not exists public_products_store_idx on public.public_products(store_slug, is_published);
create index if not exists public_products_owner_idx on public.public_products(owner_id);
alter table public.public_products enable row level security;

drop policy if exists public_products_anon_read on public.public_products;
create policy public_products_anon_read on public.public_products
  for select to anon using (store_slug = 'karine-joias' and is_published = true);

drop policy if exists public_products_auth_read on public.public_products;
create policy public_products_auth_read on public.public_products
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists public_products_auth_insert on public.public_products;
create policy public_products_auth_insert on public.public_products
  for insert to authenticated with check (owner_id = auth.uid() and store_slug = 'karine-joias');

drop policy if exists public_products_auth_update on public.public_products;
create policy public_products_auth_update on public.public_products
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and store_slug = 'karine-joias');

drop policy if exists public_products_auth_delete on public.public_products;
create policy public_products_auth_delete on public.public_products
  for delete to authenticated using (owner_id = auth.uid());

revoke all on table public.public_products from anon, authenticated;
grant select on table public.public_products to anon;
grant select, insert, update, delete on table public.public_products to authenticated;
