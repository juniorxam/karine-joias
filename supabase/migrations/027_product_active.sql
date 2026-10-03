-- Keep product availability explicit for public checkout and shipping validation.
alter table public.products
  add column if not exists active boolean not null default true;

create index if not exists products_owner_active_idx
  on public.products(owner_id, active);
