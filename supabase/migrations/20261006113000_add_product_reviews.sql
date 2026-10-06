create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1200),
  display_name text not null check (char_length(display_name) between 1 and 80),
  status text not null default 'PENDING' check (status in ('PENDING','PUBLISHED','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique(order_item_id)
);

create index if not exists product_reviews_product_status_idx
  on public.product_reviews(product_id, status, created_at desc);
create index if not exists product_reviews_owner_idx
  on public.product_reviews(owner_id, status, created_at desc);

alter table public.product_reviews enable row level security;
revoke all on table public.product_reviews from anon, authenticated;
grant select on table public.product_reviews to anon, authenticated;
grant update on table public.product_reviews to authenticated;

drop policy if exists "Public can read published product reviews" on public.product_reviews;
create policy "Public can read published product reviews"
  on public.product_reviews for select to anon, authenticated
  using (status = 'PUBLISHED');

drop policy if exists "Owners can read all product reviews" on public.product_reviews;
create policy "Owners can read all product reviews"
  on public.product_reviews for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can moderate product reviews" on public.product_reviews;
create policy "Owners can moderate product reviews"
  on public.product_reviews for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and status in ('PENDING','PUBLISHED','REJECTED'));

create or replace function public.set_product_review_published_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.status = 'PUBLISHED' and (old.status is distinct from 'PUBLISHED') then
    new.published_at := coalesce(new.published_at, now());
  elsif new.status <> 'PUBLISHED' then
    new.published_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_reviews_set_timestamps on public.product_reviews;
create trigger product_reviews_set_timestamps
before update on public.product_reviews
for each row execute function public.set_product_review_published_at();

revoke execute on function public.set_product_review_published_at() from public, anon, authenticated;
