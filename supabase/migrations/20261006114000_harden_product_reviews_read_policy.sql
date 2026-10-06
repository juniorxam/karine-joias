drop policy if exists "Public can read published product reviews" on public.product_reviews;
drop policy if exists "Owners can read all product reviews" on public.product_reviews;
create policy "Public and owners can read product reviews"
  on public.product_reviews
  for select
  to anon, authenticated
  using (status = 'PUBLISHED' or (select auth.uid()) = owner_id);

create index if not exists product_reviews_order_idx on public.product_reviews(order_id);
