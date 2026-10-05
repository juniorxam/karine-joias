alter table public.storefront_settings
  add column if not exists shipping_palmas_distance_rules jsonb not null default '[
    {"max_km":5,"price":7},
    {"max_km":10,"price":10},
    {"max_km":20,"price":15}
  ]'::jsonb;
