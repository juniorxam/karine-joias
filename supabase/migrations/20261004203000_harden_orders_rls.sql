-- O painel usa funções transacionais para alterar pedidos.
-- Não permitir UPDATE direto pela sessão autenticada, evitando manipulação de valor,
payment_status, estoque reservado ou status via Data API.
drop policy if exists orders_owner_update on public.orders;
