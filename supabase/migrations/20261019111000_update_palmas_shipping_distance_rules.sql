update public.storefront_settings
set shipping_palmas_distance_rules = '[
  {"min_km":0,"max_km":2,"price":7},
  {"min_km":2,"max_km":3,"price":8},
  {"min_km":3,"max_km":5,"price":9},
  {"min_km":5,"max_km":6,"price":10},
  {"min_km":6,"max_km":6.9,"price":11},
  {"min_km":7,"max_km":7.9,"price":12},
  {"min_km":8,"max_km":8.9,"price":13},
  {"min_km":9,"max_km":9.9,"price":14},
  {"min_km":10,"max_km":10.9,"price":15},
  {"min_km":11,"max_km":11.9,"price":16},
  {"min_km":12,"max_km":12.9,"price":18},
  {"min_km":13,"max_km":13.9,"price":20},
  {"min_km":14,"max_km":14.9,"price":22},
  {"min_km":15,"max_km":15.9,"price":24},
  {"min_km":16,"max_km":16.9,"price":26},
  {"min_km":17,"max_km":17.9,"price":28}
]'::jsonb
where store_slug = 'violetta';
