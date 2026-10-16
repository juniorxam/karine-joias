create table if not exists public.shipping_route_cache (
  cache_key text primary key,
  distance_km numeric(8,2) not null check (distance_km > 0),
  provider text not null default 'osrm',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists shipping_route_cache_expires_at_idx
  on public.shipping_route_cache (expires_at);

alter table public.shipping_route_cache enable row level security;
revoke all on table public.shipping_route_cache from anon, authenticated;
grant all on table public.shipping_route_cache to service_role;
