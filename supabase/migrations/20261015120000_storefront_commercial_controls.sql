-- Controles comerciais administráveis pela proprietária da Violetta.
alter table public.products
  add column if not exists pix_price numeric(12,2),
  add column if not exists compare_at_price numeric(12,2),
  add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists installment_count integer;

alter table public.public_products
  add column if not exists pix_price numeric(12,2),
  add column if not exists compare_at_price numeric(12,2),
  add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists installment_count integer;

alter table public.products
  drop constraint if exists products_pix_price_check,
  drop constraint if exists products_compare_at_price_check,
  drop constraint if exists products_discount_percent_check,
  drop constraint if exists products_installment_count_check,
  add constraint products_pix_price_check check (pix_price is null or pix_price >= 0),
  add constraint products_compare_at_price_check check (compare_at_price is null or compare_at_price >= 0),
  add constraint products_discount_percent_check check (discount_percent between 0 and 100),
  add constraint products_installment_count_check check (installment_count is null or installment_count between 1 and 24);

alter table public.public_products
  drop constraint if exists public_products_pix_price_check,
  drop constraint if exists public_products_compare_at_price_check,
  drop constraint if exists public_products_discount_percent_check,
  drop constraint if exists public_products_installment_count_check,
  add constraint public_products_pix_price_check check (pix_price is null or pix_price >= 0),
  add constraint public_products_compare_at_price_check check (compare_at_price is null or compare_at_price >= 0),
  add constraint public_products_discount_percent_check check (discount_percent between 0 and 100),
  add constraint public_products_installment_count_check check (installment_count is null or installment_count between 1 and 24);

-- Mantém os dados comerciais do catálogo público alinhados aos produtos existentes.
update public.public_products pp
set pix_price = p.pix_price,
    compare_at_price = p.compare_at_price,
    discount_percent = p.discount_percent,
    installment_count = p.installment_count
from public.products p
where p.id = pp.product_id
  and p.owner_id = pp.owner_id;

alter table public.storefront_settings
  add column if not exists quick_categories jsonb not null default '["Anéis","Brincos","Colares","Pulseiras","Conjuntos","Presentes"]'::jsonb,
  add column if not exists home_section_order jsonb not null default '["launches","quick_categories","best_sellers","collection_banner","latest","gifts"]'::jsonb;

comment on column public.products.pix_price is 'Preço à vista no Pix. Quando nulo, a vitrine usa o preço de venda.';
comment on column public.products.compare_at_price is 'Preço anterior/de referência exibido riscado na vitrine.';
comment on column public.products.discount_percent is 'Percentual de desconto exibido no card do produto.';
comment on column public.products.installment_count is 'Quantidade de parcelas sem juros exibida na vitrine.';
comment on column public.storefront_settings.quick_categories is 'Lista ordenada de subcategorias rápidas exibida na home.';
comment on column public.storefront_settings.home_section_order is 'Ordem das vitrines comerciais após as categorias.';
