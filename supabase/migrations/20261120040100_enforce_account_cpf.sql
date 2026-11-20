-- The checkout associates an authenticated order inside its creation transaction.
-- Reject mismatches before that transaction can reserve stock or redeem a coupon.
create function private.require_order_account_cpf()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare saved_cpf text;
begin
  if new.customer_user_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.customer_user_id is not distinct from new.customer_user_id then return new; end if;
  select cpf into saved_cpf from public.customer_tax_ids where customer_id=new.customer_user_id;
  if saved_cpf is null then
    raise exception 'Cadastre seu CPF em Minha conta antes de finalizar o pedido';
  end if;
  if regexp_replace(coalesce(new.shipping_address->>'recipient_code',''),'[^0-9]','','g') <> saved_cpf then
    raise exception 'O CPF do pedido deve ser o CPF cadastrado na sua conta';
  end if;
  return new;
end;
$$;
create trigger orders_require_account_cpf before insert or update of customer_user_id
  on public.orders for each row execute function private.require_order_account_cpf();
