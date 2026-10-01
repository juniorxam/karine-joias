-- Isola cotações de frete por loja e impede que uma cotação seja usada em outra loja.
alter table public.shipping_quotes
  add column if not exists owner_id uuid references auth.users(id);

create index if not exists idx_shipping_quotes_owner_id on public.shipping_quotes(owner_id);
