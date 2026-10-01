-- E-commerce core for Karine Joias
-- Extends the existing management system without replacing it.

alter table public.products
  add column if not exists sku text,
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists weight_grams integer not null default 0,
  add column if not exists active boolean not null default true;

create unique index if not exists products_owner_sku_idx
  on public.products(owner_id, sku)
  where sku is not null;

create unique index if not exists products_owner_slug_idx
  on public.products(owner_id, slug)
  where slug is not null;

alter table public.public_products
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists sku text;

create index if not exists public_products_slug_idx
  on public.public_products(store_slug, slug)
  where is_published = true;

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_idx
  on public.product_images(product_id, sort_order);

alter table public.product_images enable row level security;

drop policy if exists product_images_owner_all on public.product_images;
create policy product_images_owner_all on public.product_images
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images
  for select to anon
  using (
    exists (
      select 1
      from public.public_products pp
      where pp.product_id = product_images.product_id
        and pp.owner_id = product_images.owner_id
        and pp.is_published = true
        and pp.store_slug = 'karine-joias'
    )
  );

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  owner_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  shipping_postal_code text not null,
  shipping_address text not null,
  shipping_number text not null default '',
  shipping_complement text not null default '',
  shipping_neighborhood text not null default '',
  shipping_city text not null,
  shipping_state text not null,
  subtotal numeric(12,2) not null default 0,
  shipping_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  coupon_code text,
  payment_method text not null default 'PENDING',
  payment_status text not null default 'PENDING',
  status text not null default 'PENDING_PAYMENT',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_owner_idx on public.orders(owner_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_email_idx on public.orders(customer_email);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id),
  product_name text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  total_price numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  carrier text,
  service text,
  tracking_code text,
  shipping_label_url text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_order_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_order_updated_at();

drop trigger if exists shipments_set_updated_at on public.shipments;
create trigger shipments_set_updated_at
before update on public.shipments
for each row execute function public.set_order_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payment_events enable row level security;
alter table public.shipments enable row level security;

drop policy if exists orders_owner_all on public.orders;
create policy orders_owner_all on public.orders
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists order_items_owner_read on public.order_items;
create policy order_items_owner_read on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.owner_id = auth.uid()));

drop policy if exists order_status_owner_read on public.order_status_history;
create policy order_status_owner_read on public.order_status_history
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id and o.owner_id = auth.uid()));

drop policy if exists payment_events_owner_all on public.payment_events;
create policy payment_events_owner_all on public.payment_events
  for all to authenticated
  using (exists (select 1 from public.orders o where o.id = payment_events.order_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.orders o where o.id = payment_events.order_id and o.owner_id = auth.uid()));

drop policy if exists shipments_owner_all on public.shipments;
create policy shipments_owner_all on public.shipments
  for all to authenticated
  using (exists (select 1 from public.orders o where o.id = shipments.order_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.orders o where o.id = shipments.order_id and o.owner_id = auth.uid()));

revoke all on public.orders, public.order_items, public.order_status_history, public.payment_events, public.shipments from anon, authenticated;

create or replace function public.create_store_order(
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_payment_method text default 'PENDING'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2);
  v_item record;
  v_order record;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O carrinho está vazio';
  end if;

  if coalesce(trim(p_customer->>'name'), '') = '' or coalesce(trim(p_customer->>'email'), '') = '' then
    raise exception 'Nome e e-mail são obrigatórios';
  end if;

  if coalesce(trim(p_shipping->>'postal_code'), '') = ''
     or coalesce(trim(p_shipping->>'address'), '') = ''
     or coalesce(trim(p_shipping->>'city'), '') = ''
     or coalesce(trim(p_shipping->>'state'), '') = '' then
    raise exception 'Endereço de entrega incompleto';
  end if;

  with requested as (
    select
      (x->>'product_id')::bigint as product_id,
      greatest(1, (x->>'quantity')::integer) as quantity
    from jsonb_array_elements(p_items) x
  )
  select coalesce(sum(p.price * r.quantity), 0)
    into v_subtotal
  from requested r
  join public.products p on p.id = r.product_id
  join public.public_products pp
    on pp.product_id = p.id
   and pp.owner_id = p.owner_id
   and pp.store_slug = 'karine-joias'
   and pp.is_published = true
  where p.active = true;

  if v_subtotal = 0 then
    raise exception 'Nenhum produto válido no carrinho';
  end if;

  if exists (
    with requested as (
      select
        (x->>'product_id')::bigint as product_id,
        greatest(1, (x->>'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) x
    )
    select 1
    from requested r
    left join public.products p on p.id = r.product_id
    left join public.public_products pp
      on pp.product_id = p.id
     and pp.owner_id = p.owner_id
     and pp.store_slug = 'karine-joias'
     and pp.is_published = true
    where p.id is null
       or p.active is not true
       or pp.id is null
       or p.stock < r.quantity
  ) then
    raise exception 'Um ou mais produtos ficaram sem estoque ou não estão disponíveis';
  end if;

  v_order_id := gen_random_uuid();
  v_order_number := 'KJ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  insert into public.orders (
    id, order_number, owner_id, customer_name, customer_email, customer_phone,
    shipping_postal_code, shipping_address, shipping_number, shipping_complement,
    shipping_neighborhood, shipping_city, shipping_state,
    subtotal, shipping_amount, discount_amount, total_amount,
    payment_method, payment_status, status, notes
  )
  select
    v_order_id, v_order_number, p.owner_id,
    trim(p_customer->>'name'), lower(trim(p_customer->>'email')), coalesce(trim(p_customer->>'phone'), ''),
    regexp_replace(coalesce(p_shipping->>'postal_code',''), '[^0-9]', '', 'g'),
    trim(p_shipping->>'address'), coalesce(trim(p_shipping->>'number'), ''),
    coalesce(trim(p_shipping->>'complement'), ''), coalesce(trim(p_shipping->>'neighborhood'), ''),
    trim(p_shipping->>'city'), upper(trim(p_shipping->>'state')),
    v_subtotal, 0, 0, v_subtotal,
    coalesce(nullif(p_payment_method, ''), 'PENDING'), 'PENDING', 'PENDING_PAYMENT', ''
  from public.products p
  join public.public_products pp
    on pp.product_id = p.id and pp.owner_id = p.owner_id
  where p.id = ((jsonb_array_elements(p_items)->>'product_id')::bigint)
    and pp.store_slug = 'karine-joias'
    and pp.is_published = true
  limit 1;

  for v_item in
    with requested as (
      select (x->>'product_id')::bigint as product_id, greatest(1, (x->>'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) x
    )
    select p.id product_id, p.name, p.sku, p.price, r.quantity
    from requested r
    join public.products p on p.id = r.product_id
  loop
    insert into public.order_items(order_id, product_id, product_name, sku, quantity, unit_price, total_price)
    values (v_order_id, v_item.product_id, v_item.name, v_item.sku, v_item.quantity, v_item.price, v_item.price * v_item.quantity);

    update public.products
       set stock = stock - v_item.quantity,
           updated_at = now()
     where id = v_item.product_id
       and stock >= v_item.quantity;

    if not found then
      raise exception 'Estoque insuficiente para o produto %', v_item.name;
    end if;
  end loop;

  insert into public.order_status_history(order_id, status, note)
  values (v_order_id, 'PENDING_PAYMENT', 'Pedido criado pela loja online');

  select * into v_order from public.orders where id = v_order_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'subtotal', v_order.subtotal,
    'shipping_amount', v_order.shipping_amount,
    'discount_amount', v_order.discount_amount,
    'total_amount', v_order.total_amount,
    'status', v_order.status,
    'payment_status', v_order.payment_status
  );
end;
$$;

revoke all on function public.create_store_order(jsonb,jsonb,jsonb,text) from public;
grant execute on function public.create_store_order(jsonb,jsonb,jsonb,text) to anon, authenticated;
