alter table public.products
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

alter table public.public_products
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

update public.products
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and image_url <> ''
  and (image_urls = '[]'::jsonb or image_urls is null);

update public.public_products
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and image_url <> ''
  and (image_urls = '[]'::jsonb or image_urls is null);
