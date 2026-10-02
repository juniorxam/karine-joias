-- Keep the public catalog schema aligned with the storefront contract.
alter table public.public_products
  add column if not exists slug text,
  add column if not exists description text;

create unique index if not exists public_products_store_slug_unique
  on public.public_products (store_slug, slug)
  where slug is not null;

create index if not exists public_products_store_published_created_idx
  on public.public_products (store_slug, is_published, created_at desc);
