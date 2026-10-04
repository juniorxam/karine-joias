-- Padroniza o identificador da loja para Violetta sem perder registros existentes.
update public.public_products
set store_slug = 'violetta', updated_at = now()
where store_slug = 'karine-joias';

update public.storefront_settings
set store_slug = 'violetta', updated_at = now()
where store_slug = 'karine-joias';

alter table public.public_products
  alter column store_slug set default 'violetta';

alter table public.storefront_settings
  alter column store_slug set default 'violetta';

-- Atualiza as políticas históricas que restringiam o catálogo ao slug antigo.
drop policy if exists public_products_anon_read on public.public_products;
create policy public_products_anon_read on public.public_products
  for select to anon using (store_slug = 'violetta' and is_published = true);

drop policy if exists public_products_auth_insert on public.public_products;
create policy public_products_auth_insert on public.public_products
  for insert to authenticated
  with check (owner_id = auth.uid() and store_slug = 'violetta');

drop policy if exists public_products_auth_update on public.public_products;
create policy public_products_auth_update on public.public_products
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and store_slug = 'violetta');
