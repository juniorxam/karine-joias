-- Keep the inventory and storefront pricing fields aligned with the frontend catalog model.
-- Safe to run against an existing database: all columns are additive and guarded.

alter table public.products
  add column if not exists pix_price numeric,
  add column if not exists compare_at_price numeric,
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists installment_count integer;

alter table public.public_products
  add column if not exists pix_price numeric,
  add column if not exists compare_at_price numeric,
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists installment_count integer;
