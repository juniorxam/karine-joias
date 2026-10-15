-- Exclusão permanente de produtos somente para o papel developer.
-- Remove dependências de catálogo, imagens, estoque, vendas e pedidos relacionados.
create or replace function private.delete_product_service(p_owner_id uuid, p_product_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_orders uuid[];
begin
  if auth.uid() is null or not private.has_store_role(p_owner_id, array['developer']) then
    raise exception 'Somente o desenvolvedor pode excluir produtos';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and owner_id = p_owner_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  select coalesce(array_agg(distinct oi.order_id), '{}'::uuid[])
    into v_orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id and o.owner_id = p_owner_id;

  delete from public.coupon_redemptions where order_id = any(v_orders);
  delete from public.orders where id = any(v_orders) and owner_id = p_owner_id;
  delete from public.stock_movements where product_id = p_product_id and owner_id = p_owner_id;
  delete from public.cash_entries where sale_id in (select id from public.sales where product_id = p_product_id and owner_id = p_owner_id);
  delete from public.sales where product_id = p_product_id and owner_id = p_owner_id;
  delete from public.public_products where product_id = p_product_id and owner_id = p_owner_id;
  delete from public.product_images where product_id = p_product_id and owner_id = p_owner_id;
  delete from public.products where id = p_product_id and owner_id = p_owner_id;

  return jsonb_build_object('product_id', p_product_id, 'product_name', v_product.name, 'deleted', true);
end;
$$;

revoke all on function private.delete_product_service(uuid, bigint) from public;

drop function if exists public.delete_product(uuid, bigint);
create function public.delete_product(p_owner_id uuid, p_product_id bigint)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.delete_product_service($1, $2);
$$;

revoke all on function public.delete_product(uuid, bigint) from public;
grant execute on function public.delete_product(uuid, bigint) to authenticated;
