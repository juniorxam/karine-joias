-- Fix the email regex stored in the order service. The previous migration
-- escaped the backslashes twice, rejecting every valid email address.
do $migration$
declare
  v_definition text;
  v_old text := quote_literal('^' || chr(92) || chr(92) || 'S+@' || chr(92) || chr(92) || 'S+' || chr(92) || chr(92) || '.' || chr(92) || chr(92) || 'S+$');
  v_new text := quote_literal('^[^[:space:]@]+@[^[:space:]@]+' || chr(92) || '.[^[:space:]@]+$');
begin
  select pg_get_functiondef('public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text,text)'::regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'RPC de criação de pedido não encontrada';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$migration$;
