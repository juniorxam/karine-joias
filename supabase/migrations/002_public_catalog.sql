create table if not exists public.public_products (
  id uuid primary key default gen_random_uuid(),
  store_slug text not null default 'karine-joias',
  name text not null,
  category text not null,
  material text not null default '',
  price numeric(12,2) not null default 0,
  image_url text,
  featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_products_store_idx on public.public_products(store_slug, is_published);
alter table public.public_products enable row level security;

 drop policy if exists public_products_anon_read on public.public_products;
create policy public_products_anon_read on public.public_products
  for select to anon using (store_slug = 'karine-joias' and is_published = true);

drop policy if exists public_products_auth_read on public.public_products;
create policy public_products_auth_read on public.public_products
  for select to authenticated using (store_slug = 'karine-joias' and is_published = true);

revoke all on table public.public_products from anon, authenticated;
grant select on table public.public_products to anon, authenticated;

insert into public.public_products (id, store_slug, name, category, material, price, featured, is_published)
values
  ('00000000-0000-4000-8000-000000000001', 'karine-joias', 'Anel Solitário Aurora', 'Joias', 'Ouro 18k', 1290, true, true),
  ('00000000-0000-4000-8000-000000000002', 'karine-joias', 'Colar Gota Serena', 'Semi-joias', 'Prata 925', 289, true, true),
  ('00000000-0000-4000-8000-000000000003', 'karine-joias', 'Brinco Pérola Luna', 'Joias', 'Ouro 18k', 890, false, true),
  ('00000000-0000-4000-8000-000000000004', 'karine-joias', 'Pulseira Luz', 'Semi-joias', 'Banho rosé', 189, false, true),
  ('00000000-0000-4000-8000-000000000005', 'karine-joias', 'Ear Cuff Rosé', 'Acessórios', 'Banho rosé', 89, false, true),
  ('00000000-0000-4000-8000-000000000006', 'karine-joias', 'Aliança Essenza', 'Joias', 'Ouro 18k', 1790, true, true),
  ('00000000-0000-4000-8000-000000000007', 'karine-joias', 'Mix de Anéis Dourado', 'Semi-joias', 'Banho 18k', 249, false, true)
on conflict (id) do nothing;
