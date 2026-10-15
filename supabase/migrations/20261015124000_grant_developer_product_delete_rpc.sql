-- Permite que usuários autenticados chamem o wrapper RPC.
-- A própria função security definer continua validando exclusivamente o papel developer.
grant execute on function private.delete_product_service(uuid, bigint) to authenticated;
notify pgrst, 'reload schema';
