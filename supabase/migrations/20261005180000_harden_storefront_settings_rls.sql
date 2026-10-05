-- Public storefront settings are intentionally readable without login,
-- but only for the active public store. Owner-scoped management remains protected
-- by the existing authenticated policy.
drop policy if exists "public can view published storefront settings" on public.storefront_settings;

create policy "public can view published storefront settings"
  on public.storefront_settings
  for select
  to anon
  using (store_slug = 'violetta');

grant select on public.storefront_settings to anon, authenticated;
