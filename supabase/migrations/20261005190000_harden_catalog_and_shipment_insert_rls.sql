-- Prevent authenticated users from creating shipment records for another owner's order.
drop policy if exists "owners can insert shipments" on public.shipments;
create policy "owners can insert shipments"
  on public.shipments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = shipments.order_id
        and o.owner_id = (select auth.uid())
    )
  );

-- Prevent authenticated users from injecting catalog rows under another owner.
drop policy if exists "public_products_auth_insert" on public.public_products;
create policy "public_products_auth_insert"
  on public.public_products
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));
