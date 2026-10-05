alter table public.storefront_settings
  add column if not exists shipping_palmas_distance_rules jsonb not null default '[
    {"min_km":0,"max_km":5,"price":7},
    {"min_km":5,"max_km":10,"price":10},
    {"min_km":10,"max_km":20,"price":15},
    {"min_km":20,"max_km":null,"price":20}
  ]'::jsonb;
