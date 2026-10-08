create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  product_id bigint not null references public.products(id),
  movement_type text not null check (movement_type in ('ENTRY','EXIT','ADJUSTMENT','SALE','RETURN')),
  quantity integer not null check (quantity <> 0),
  stock_before integer not null,
  stock_after integer not null,
  reason text not null default '',
  sale_id bigint null references public.sales(id),
  created_at timestamptz not null default now()
);
alter table public.stock_movements enable row level security;
create index if not exists stock_movements_owner_created_idx on public.stock_movements(owner_id, created_at desc);
create index if not exists stock_movements_product_created_idx on public.stock_movements(product_id, created_at desc);
create index if not exists stock_movements_sale_idx on public.stock_movements(sale_id);
drop policy if exists stock_movements_owner_select on public.stock_movements;
create policy stock_movements_owner_select on public.stock_movements for select to authenticated using ((select auth.uid()) = owner_id);
create or replace function private.adjust_product_stock_service(p_product_id bigint,p_delta integer,p_reason text default 'Ajuste manual') returns public.products language plpgsql security definer set search_path to '' as $$
declare v_owner uuid:=private.get_store_owner_id(); v_product public.products%rowtype; v_before integer;
begin
 if v_owner is null then raise exception 'Não autenticado'; end if;
 if p_delta is null or p_delta=0 then raise exception 'Quantidade de ajuste inválida'; end if;
 select * into v_product from public.products where id=p_product_id and owner_id=v_owner for update;
 if not found then raise exception 'Produto não encontrado'; end if;
 v_before:=v_product.stock;
 if v_before+p_delta<0 then raise exception 'Estoque não pode ficar negativo'; end if;
 update public.products set stock=v_before+p_delta,updated_at=now() where id=v_product.id and owner_id=v_owner returning * into v_product;
 insert into public.stock_movements(owner_id,product_id,movement_type,quantity,stock_before,stock_after,reason) values(v_owner,v_product.id,case when p_delta>0 then 'ENTRY' else 'EXIT' end,p_delta,v_before,v_product.stock,coalesce(nullif(trim(p_reason),''),'Ajuste manual'));
 return v_product;
end; $$;
create or replace function public.adjust_product_stock(p_product_id bigint,p_delta integer,p_reason text default 'Ajuste manual') returns public.products language sql security invoker set search_path to '' as $$ select private.adjust_product_stock_service($1,$2,$3); $$;
revoke all on function public.adjust_product_stock(bigint,integer,text) from public;
grant execute on function public.adjust_product_stock(bigint,integer,text) to authenticated;

create or replace function private.create_manual_sale_service(p_date date,p_product_id bigint,p_client_id bigint,p_amount numeric,p_payment text,p_discount numeric default 0,p_quantity integer default 1) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid:=private.get_store_owner_id(); v_product public.products%rowtype; v_sale public.sales%rowtype; v_cash public.cash_entries%rowtype; v_before integer;
begin
 if v_owner is null then raise exception 'Não autenticado'; end if;
 if p_amount is null or p_amount<0 then raise exception 'Valor da venda inválido'; end if;
 if p_discount is null or p_discount<0 then raise exception 'Desconto inválido'; end if;
 if p_quantity is null or p_quantity<1 then raise exception 'Quantidade inválida'; end if;
 select * into v_product from public.products where id=p_product_id and owner_id=v_owner for update;
 if not found then raise exception 'Produto não encontrado'; end if;
 if v_product.stock<p_quantity then raise exception using message='Estoque insuficiente. Disponível: '||v_product.stock; end if;
 v_before:=v_product.stock;
 insert into public.sales(owner_id,date,product_id,client_id,amount,payment,discount,channel,quantity) values(v_owner,p_date,p_product_id,p_client_id,p_amount,p_payment,p_discount,'PRESENCIAL',p_quantity) returning * into v_sale;
 update public.products set stock=stock-p_quantity,updated_at=now() where id=v_product.id and owner_id=v_owner returning * into v_product;
 insert into public.stock_movements(owner_id,product_id,movement_type,quantity,stock_before,stock_after,reason,sale_id) values(v_owner,v_product.id,'SALE',-p_quantity,v_before,v_product.stock,'Venda presencial',v_sale.id);
 insert into public.cash_entries(owner_id,date,type,category,description,amount,sale_id) values(v_owner,p_date,'Entrada','Venda','Venda presencial #'||right(v_sale.id::text,8),p_amount,v_sale.id) returning * into v_cash;
 return jsonb_build_object('sale',to_jsonb(v_sale),'cash',to_jsonb(v_cash),'product',to_jsonb(v_product));
end; $$;
create or replace function private.delete_manual_sale_service(p_sale_id bigint) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid:=private.get_store_owner_id(); v_sale public.sales%rowtype; v_product public.products%rowtype; v_cash_id bigint; v_before integer;
begin
 if v_owner is null then raise exception 'Não autenticado'; end if;
 select * into v_sale from public.sales where id=p_sale_id and owner_id=v_owner for update;
 if not found then raise exception 'Venda não encontrada'; end if;
 if v_sale.product_id is not null then
  select * into v_product from public.products where id=v_sale.product_id and owner_id=v_owner for update;
  if found then v_before:=v_product.stock; update public.products set stock=stock+coalesce(v_sale.quantity,1),updated_at=now() where id=v_product.id and owner_id=v_owner returning * into v_product;
   insert into public.stock_movements(owner_id,product_id,movement_type,quantity,stock_before,stock_after,reason,sale_id) values(v_owner,v_product.id,'RETURN',coalesce(v_sale.quantity,1),v_before,v_product.stock,'Estorno de venda presencial',v_sale.id);
  end if;
 end if;
 select id into v_cash_id from public.cash_entries where sale_id=v_sale.id and owner_id=v_owner for update;
 delete from public.cash_entries where sale_id=v_sale.id and owner_id=v_owner;
 delete from public.sales where id=v_sale.id and owner_id=v_owner;
 return jsonb_build_object('sale_id',v_sale.id,'cash_id',v_cash_id,'product_id',v_sale.product_id);
end; $$;