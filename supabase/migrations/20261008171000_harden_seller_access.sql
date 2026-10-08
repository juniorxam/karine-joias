-- Harden seller access to storefront/configuration and online-order internals.
drop policy if exists public_products_auth_delete on public.public_products;
drop policy if exists public_products_auth_insert on public.public_products;
drop policy if exists public_products_auth_read on public.public_products;
drop policy if exists public_products_auth_update on public.public_products;
create policy public_products_owner_developer_read on public.public_products for select to authenticated using(private.has_store_role(owner_id,array['owner','developer']));
create policy public_products_owner_developer_insert on public.public_products for insert to authenticated with check(private.has_store_role(owner_id,array['owner','developer']));
create policy public_products_owner_developer_update on public.public_products for update to authenticated using(private.has_store_role(owner_id,array['owner','developer'])) with check(private.has_store_role(owner_id,array['owner','developer']));
create policy public_products_owner_developer_delete on public.public_products for delete to authenticated using(private.has_store_role(owner_id,array['owner','developer']));

drop policy if exists "store members can manage storefront settings" on public.storefront_settings;
create policy storefront_settings_owner_developer_all on public.storefront_settings for all to authenticated using(private.has_store_role(owner_id,array['owner','developer'])) with check(private.has_store_role(owner_id,array['owner','developer']));

drop policy if exists "store members can insert order history" on public.order_status_history;
create policy order_history_owner_developer_insert on public.order_status_history for insert to authenticated with check(exists(select 1 from public.orders o where o.id=order_status_history.order_id and private.has_store_role(o.owner_id,array['owner','developer'])));

drop policy if exists payment_events_owner_select on public.payment_events;
create policy payment_events_owner_developer_select on public.payment_events for select to authenticated using(exists(select 1 from public.orders o where o.id=payment_events.order_id and private.has_store_role(o.owner_id,array['owner','developer'])));

drop policy if exists "Store members can moderate product reviews" on public.product_reviews;
create policy product_reviews_owner_developer_moderate on public.product_reviews for update to authenticated using(private.has_store_role(owner_id,array['owner','developer'])) with check(private.has_store_role(owner_id,array['owner','developer']));

drop policy if exists receiving_accounts_access on public.receiving_accounts;
create policy receiving_accounts_owner_developer_all on public.receiving_accounts for all to authenticated using(private.has_store_role(owner_id,array['owner','developer'])) with check(private.has_store_role(owner_id,array['owner','developer']));

drop policy if exists "store members can insert shipments" on public.shipments;
drop policy if exists "store members can update shipments" on public.shipments;
create policy shipments_owner_developer_insert on public.shipments for insert to authenticated with check(exists(select 1 from public.orders o where o.id=shipments.order_id and private.has_store_role(o.owner_id,array['owner','developer'])));
create policy shipments_owner_developer_update on public.shipments for update to authenticated using(exists(select 1 from public.orders o where o.id=shipments.order_id and private.has_store_role(o.owner_id,array['owner','developer']))) with check(exists(select 1 from public.orders o where o.id=shipments.order_id and private.has_store_role(o.owner_id,array['owner','developer'])));