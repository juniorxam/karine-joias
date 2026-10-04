-- A retirada no local em Palmas não exige endereço residencial completo.
-- A função de pedidos mantém CEP, cidade e UF para identificar a operação local.
DO $outer$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_definition
  FROM pg_proc
  WHERE oid = 'public.create_store_order_service(uuid,jsonb,jsonb,jsonb,numeric,text,text,text,text)'::regprocedure;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Função create_store_order_service não encontrada';
  END IF;

  v_definition := replace(
    v_definition,
    $old$if coalesce(length(trim(p_shipping->>'address')),0) < 2 or coalesce(length(trim(p_shipping->>'number')),0) < 1 or coalesce(length(trim(p_shipping->>'neighborhood')),0) < 2 or coalesce(length(trim(p_shipping->>'city')),0) < 2 or upper(trim(p_shipping->>'state')) !~ '^[A-Z]{2}$' then raise exception 'Endereço inválido'; end if;$old$,
    $new$if coalesce(p_shipping->'shipping_option'->>'service','') <> 'Retirada no local'
       and (
         coalesce(length(trim(p_shipping->>'address')),0) < 2
         or coalesce(length(trim(p_shipping->>'number')),0) < 1
         or coalesce(length(trim(p_shipping->>'neighborhood')),0) < 2
         or coalesce(length(trim(p_shipping->>'city')),0) < 2
         or upper(trim(p_shipping->>'state')) !~ '^[A-Z]{2}$'
       )
    then raise exception 'Endereço inválido'; end if;$new$
  );

  EXECUTE v_definition;
END $outer$;
