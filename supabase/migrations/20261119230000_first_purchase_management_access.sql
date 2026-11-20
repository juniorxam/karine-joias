-- The promotion panel uses the authenticated Data API for first-purchase settings.
grant select, insert, update on public.first_purchase_settings to authenticated;

-- Existing access policies also cover sellers. Restrict this configuration to
-- the management roles that own the promotions workflow.
create policy "First purchase settings management roles"
on public.first_purchase_settings as restrictive for all to authenticated
using (private.has_store_role(owner_id, array['owner','developer']::text[]))
with check (private.has_store_role(owner_id, array['owner','developer']::text[]));

