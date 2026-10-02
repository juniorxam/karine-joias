alter table public.public_products
  add column if not exists stock integer not null default 0,
  add column if not exists is_new boolean not null default false,
  add column if not exists is_best_seller boolean not null default false,
  add column if not exists sort_order integer not null default 0;

create index if not exists public_products_store_merchandising_idx
  on public.public_products (store_slug, is_published, featured desc, sort_order asc, created_at desc);

alter table public.storefront_settings
  add column if not exists collection_enabled boolean not null default true,
  add column if not exists collection_title text not null default 'Uma coleção para guardar.',
  add column if not exists collection_subtitle text not null default 'Detalhes delicados para acompanhar você em todos os momentos.',
  add column if not exists collection_image_url text,
  add column if not exists collection_cta text not null default 'Conhecer coleção';

create or replace function public.set_updated_at_storefront_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists storefront_settings_updated_at on public.storefront_settings;
create trigger storefront_settings_updated_at
before update on public.storefront_settings
for each row execute function public.set_updated_at_storefront_settings();

update public.public_products pp
set stock = p.stock
from public.products p
where p.id = pp.product_id
  and pp.stock is distinct from p.stock;
