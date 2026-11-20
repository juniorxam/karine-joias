create table public.customer_carts (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '{}' check (jsonb_typeof(items) = 'object')
);
alter table public.customer_carts enable row level security;
revoke all on public.customer_carts from public, anon, authenticated;
grant select, insert, update on public.customer_carts to authenticated;
create policy "Customers own their cart" on public.customer_carts
  for all to authenticated using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

-- Apply changes against the current cart under a row lock so devices can edit
-- different items or add to the same item without overwriting each other.
create function public.update_customer_cart(p_customer uuid, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_customer uuid := auth.uid();
  v_items jsonb;
  v_change jsonb;
  v_product jsonb;
  v_id text;
  v_delta integer;
  v_old integer;
  v_quantity integer;
begin
  if v_customer is null or v_customer is distinct from p_customer then raise exception 'Entre para sincronizar seu carrinho'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or octet_length(p_changes::text)>65000
      or jsonb_array_length(p_changes)>60 then raise exception 'Alterações inválidas no carrinho'; end if;
  insert into public.customer_carts(customer_id) values(v_customer) on conflict do nothing;
  select items into v_items from public.customer_carts where customer_id=v_customer for update;
  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_id := v_change->>'id';
    if v_id is null or v_id !~ '^[0-9]{1,19}$' or coalesce(v_change->>'quantity','') !~ '^-?[0-9]{1,2}$' then
      raise exception 'Item inválido no carrinho';
    end if;
    v_delta := (v_change->>'quantity')::integer;
    if abs(v_delta)>20 then raise exception 'Quantidade inválida'; end if;
    v_old := coalesce((v_items->v_id->>'quantity')::integer,0);
    v_quantity := case when v_change->>'mode'='merge' then greatest(v_old,v_delta)
      when v_change->>'mode'='remove' then 0
      else least(20,v_old+v_delta) end;
    if v_quantity <= 0 then
      v_items := v_items - v_id;
    else
      v_product := coalesce(v_change->'product',v_items->v_id,'{}'::jsonb);
      v_items := jsonb_set(v_items,array[v_id],jsonb_build_object(
        'id',v_id,'quantity',v_quantity,
        'name',left(coalesce(v_product->>'name','Peça da Violetta'),160),
        'material',left(coalesce(v_product->>'material',''),120),
        'imageUrl',left(v_product->>'imageUrl',1000),
        'price',case when coalesce(v_product->>'price','') ~ '^[0-9]{1,8}([.][0-9]{1,2})?$' then (v_product->>'price')::numeric else 0 end));
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(v_items))>30 then raise exception 'O carrinho aceita até 30 peças diferentes'; end if;
  update public.customer_carts set items=v_items where customer_id=v_customer;
  return v_items;
end;
$$;
revoke all on function public.update_customer_cart(uuid,jsonb) from public, anon;
grant execute on function public.update_customer_cart(uuid,jsonb) to authenticated;
