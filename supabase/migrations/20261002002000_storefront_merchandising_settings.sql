create table if not exists public.storefront_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  store_slug text not null default 'karine-joias',
  hero_title text not null default 'Seu brilho, seu momento.',
  hero_subtitle text not null default 'Descubra peças escolhidas para valorizar cada detalhe. Elegância, delicadeza e personalidade em uma só vitrine.',
  hero_image_url text,
  hero_cta text not null default 'Comprar agora',
  featured_title text not null default 'Peças para se apaixonar.',
  featured_enabled boolean not null default true,
  latest_enabled boolean not null default true,
  category_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, store_slug)
);
alter table public.storefront_settings enable row level security;
create policy "public can view published storefront settings" on public.storefront_settings for select to anon using (true);
create policy "owner can manage storefront settings" on public.storefront_settings for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select on public.storefront_settings to anon, authenticated;
grant insert, update, delete on public.storefront_settings to authenticated;