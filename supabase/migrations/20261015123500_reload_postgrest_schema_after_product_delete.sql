-- Faz o PostgREST reconhecer imediatamente a função RPC criada para exclusão segura.
notify pgrst, 'reload schema';
