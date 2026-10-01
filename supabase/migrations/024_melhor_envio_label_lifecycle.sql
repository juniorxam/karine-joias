-- Melhor Envio label lifecycle metadata

alter table public.shipments
  add column if not exists melhor_envio_label_status text not null default 'cart',
  add column if not exists melhor_envio_checkout_started_at timestamptz,
  add column if not exists melhor_envio_label_purchased_at timestamptz,
  add column if not exists melhor_envio_label_generated_at timestamptz;

create index if not exists shipments_melhor_envio_label_status_idx
  on public.shipments (melhor_envio_label_status);

update public.shipments
set melhor_envio_label_status = case
  when label_url is not null then 'generated'
  when melhor_envio_order_id is not null then 'cart'
  else 'cart'
end
where melhor_envio_label_status = 'cart';