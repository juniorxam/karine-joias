alter table public.storefront_settings
  add column if not exists shipping_palmas_enabled boolean not null default true,
  add column if not exists shipping_palmas_min_subtotal numeric not null default 50,
  add column if not exists shipping_palmas_free_above numeric not null default 100,
  add column if not exists shipping_palmas_price numeric not null default 7,
  add column if not exists shipping_palmas_pickup_enabled boolean not null default true,
  add column if not exists shipping_origin_postal_code text not null default '77001540';

comment on column public.storefront_settings.shipping_palmas_enabled is 'Ativa ou desativa as regras de entrega local para CEPs de Palmas.';
comment on column public.storefront_settings.shipping_palmas_min_subtotal is 'Valor mínimo do subtotal para oferecer entrega local em Palmas.';
comment on column public.storefront_settings.shipping_palmas_free_above is 'Subtotal a partir do qual a entrega local em Palmas fica grátis.';
comment on column public.storefront_settings.shipping_palmas_price is 'Valor da entrega local em Palmas quando não for grátis.';
comment on column public.storefront_settings.shipping_palmas_pickup_enabled is 'Permite retirada no local como opção de frete.';
comment on column public.storefront_settings.shipping_origin_postal_code is 'CEP de origem usado pelo Melhor Envio.';