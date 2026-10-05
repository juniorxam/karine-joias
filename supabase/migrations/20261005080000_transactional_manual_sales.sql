-- Transactional manual sales: keep stock, sale and cash consistent.
create schema if not exists private;

alter table public.cash_entries
  add column if not exists sale_id bigint references public.sales(id) on delete cascade;

create unique index if not exists cash_entries_sale_id_uidx
  on public.cash_entries(sale_id)
  where sale_id is not null;

update public.cash_entries c
set sale_id = s.id
from public.sales s
where c.sale_id is null
  and c.owner_id = s.owner_id
  and c.id = s.id + 1
  and c.category = 'Venda'
  and c.type = 'Entrada';

create or replace function private.create_manual_sale_service(
  p_date date,
  p_product_id bigint,
  p_client_id bigint,
  p_amount numeric,
  p_payment text,
  p_discount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_product public.products%rowtype;
  v_sale public.sales%rowtype;
  v_cash public.cash_entries%rowtype;
begin
  if v_owner is null then raise exception 'Não autenticado'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Valor da venda inválido'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Desconto inválido'; end if;

  select * into v_product
  from public.products
  where id = p_product_id and owner_id = v_owner
  for update;

  if not found then raise exception 'Produto não encontrado'; end if;
  if v_product.stock < 1 then raise exception 'Produto sem estoque'; end if;

  insert into public.sales(owner_id,date,product_id,client_id,amount,payment,discount)
  values(v_owner,p_date,p_product_id,p_client_id,p_amount,p_payment,p_discount)
  returning * into v_sale;

  update public.products
  set stock = stock - 1, updated_at = now()
  where id = v_product.id and owner_id = v_owner
  returning * into v_product;

  insert into public.cash_entries(owner_id,date,type,category,description,amount,sale_id)
  values(v_owner,p_date,'Entrada','Venda','Venda #' || right(v_sale.id::text,8),p_amount,v_sale.id)
  returning * into v_cash;

  return jsonb_build_object('sale',to_jsonb(v_sale),'cash',to_jsonb(v_cash),'product',to_jsonb(v_product));
end;
$$;

create or replace function private.delete_manual_sale_service(p_sale_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_product public.products%rowtype;
  v_cash_id bigint;
begin
  if v_owner is null then raise exception 'Não autenticado'; end if;

  select * into v_sale from public.sales
  where id=p_sale_id and owner_id=v_owner
  for update;
  if not found then raise exception 'Venda não encontrada'; end if;

  if v_sale.product_id is not null then
    select * into v_product from public.products
    where id=v_sale.product_id and owner_id=v_owner
    for update;
    if found then
      update public.products set stock=stock+1,updated_at=now()
      where id=v_product.id and owner_id=v_owner;
    end if;
  end if;

  select id into v_cash_id from public.cash_entries
  where sale_id=v_sale.id and owner_id=v_owner
  for update;

  delete from public.cash_entries where sale_id=v_sale.id and owner_id=v_owner;
  delete from public.sales where id=v_sale.id and owner_id=v_owner;

  return jsonb_build_object('sale_id',v_sale.id,'cash_id',v_cash_id,'product_id',v_sale.product_id);
end;
$$;

revoke all on function private.create_manual_sale_service(date,bigint,bigint,numeric,text,numeric) from public,anon;
revoke all on function private.delete_manual_sale_service(bigint) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.create_manual_sale_service(date,bigint,bigint,numeric,text,numeric) to authenticated;
grant execute on function private.delete_manual_sale_service(bigint) to authenticated;

create or replace function public.create_manual_sale(
  p_date date,p_product_id bigint,p_client_id bigint,p_amount numeric,p_payment text,p_discount numeric default 0
)
returns jsonb language sql security invoker
as $$ select private.create_manual_sale_service($1,$2,$3,$4,$5,$6); $$;

create or replace function public.delete_manual_sale(p_sale_id bigint)
returns jsonb language sql security invoker
as $$ select private.delete_manual_sale_service($1); $$;

revoke execute on function public.create_manual_sale(date,bigint,bigint,numeric,text,numeric) from public,anon;
revoke execute on function public.delete_manual_sale(bigint) from public,anon;
grant execute on function public.create_manual_sale(date,bigint,bigint,numeric,text,numeric) to authenticated;
grant execute on function public.delete_manual_sale(bigint) to authenticated;