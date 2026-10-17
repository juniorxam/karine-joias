# Violetta Joias e Semijoias

Aplicação de gestão e loja virtual da Violetta Joias e Semijoias.

## Arquitetura

- **Frontend:** React + TypeScript + Vite.
- **Administração:** `/gestao`, com autenticação Supabase e dados sincronizados no PostgreSQL. O painel não é divulgado na vitrine.
- **Loja pública:** `/loja`, catálogo, carrinho, checkout, cupons e acompanhamento do pedido.
- **Pagamentos online:** InfinitePay, com geração de link de checkout e confirmação do pagamento pelo endpoint oficial `payment_check`, acionado pela Edge Function `infinitepay-webhook`.
- **Frete:** cálculo próprio da Violetta para Palmas-TO, com regras configuradas na loja. Localidades fora da área atendida podem depender de confirmação manual. Melhor Envio não faz parte do checkout atual.
- **Banco de dados:** Supabase Postgres, com RLS e funções de servidor para operações sensíveis.
- **Hospedagem:** Vercel para o frontend e Supabase Edge Functions para checkout e integrações.

## Executar localmente

```bash
pnpm install
pnpm dev
```

Verificação TypeScript:

```bash
pnpm check
```

Build de produção:

```bash
pnpm build
```

## Variáveis de ambiente

Variáveis públicas do frontend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STORE_WHATSAPP=
VITE_STORE_INSTAGRAM=
```

Configuração do servidor / Supabase Edge Functions:

```env
PUBLIC_SITE_URL=https://violetta.com.br
INFINITEPAY_HANDLE=violettaprataesemijoias
```

O checkout atual usa o identificador da conta InfinitePay (`INFINITEPAY_HANDLE`) para criar links. Confirme no painel da InfinitePay que o identificador corresponde à conta que receberá as vendas. A integração atual não usa `MP_ACCESS_TOKEN` nem `MP_WEBHOOK_KEY`.

As funções de servidor também precisam das credenciais internas do Supabase disponibilizadas pelo ambiente, como `SUPABASE_URL` e uma chave de serviço com privilégios adequados. Essas chaves devem ficar exclusivamente no ambiente seguro do Supabase; nunca use prefixo `VITE_` para segredos e nunca os envie ao navegador ou ao GitHub.

Use os arquivos `.env.example` e `supabase/functions/.env.example` como referência. Eles são modelos, não devem conter credenciais reais.

## Fluxo de compra

1. O cliente seleciona os produtos na rota `/loja`.
2. O checkout coleta os dados do cliente e o endereço de entrega.
3. A Edge Function `create-order` cria o pedido e valida itens, estoque, frete, cupom e total.
4. A Edge Function `create-infinitepay-payment` consulta o pedido salvo, valida novamente o total e cria o link de pagamento InfinitePay.
5. O cliente é redirecionado ao checkout hospedado pela InfinitePay.
6. A InfinitePay envia uma notificação para `infinitepay-webhook`.
7. O webhook consulta o endpoint oficial `payment_check`; a notificação recebida, sozinha, não é considerada prova de pagamento.
8. O sistema confere se o pagamento foi confirmado e se o valor recebido corresponde ao total do pedido antes de marcar o pedido como pago.
9. A proprietária acompanha o pedido e a situação do pagamento em `/gestao`.

A criação do link e a confirmação do pagamento são etapas diferentes. Não marque um pedido como pago com base apenas no retorno do navegador ou em uma notificação sem validação no servidor.

## Funções de pagamento

- `create-infinitepay-payment`: gera ou reutiliza o link de pagamento de um pedido pendente.
- `infinitepay-webhook`: valida o pagamento com a InfinitePay, registra o evento e atualiza o pedido.
- `create-order`: cria o pedido antes do pagamento, com validações de integridade.

**Integração antiga desativada:** os endpoints `create-payment` e `mercadopago-webhook` foram substituídos por respostas HTTP 410 (integração desativada). Eles não criam cobranças nem atualizam pedidos. O fluxo de novas compras deve usar exclusivamente InfinitePay. As funções antigas permanecem cadastradas no Supabase por não haver ação de exclusão disponível nesta integração, mas seu código operacional foi retirado.

## Segurança

- Nunca exponha a chave de serviço do Supabase, credenciais privadas ou segredos em variáveis `VITE_*`.
- Mantenha RLS e políticas de acesso coerentes com o papel de cada tabela. Não torne tabelas administrativas públicas apenas para eliminar avisos do Security Advisor.
- Valide valores e estados do pedido no servidor; não confie no preço, frete, desconto ou status enviado pelo navegador.
- Confirme pagamentos no servidor com a InfinitePay antes de atualizar o status do pedido.
- Preserve idempotência na criação do pedido e do checkout para evitar duplicidade em cliques repetidos ou novas tentativas.
- Restrinja o acesso ao painel `/gestao` por autenticação e autorização, independentemente de a rota ser conhecida ou não.

## SEO e domínio

A vitrine define metatags, canonical, Open Graph e dados estruturados de produto/loja. O arquivo `robots.txt` deve permitir a indexação das páginas públicas e evitar indexação de checkout e acompanhamento de pedidos.

- Domínio de produção: `https://violetta.com.br`
- `PUBLIC_SITE_URL` deve corresponder ao domínio de produção.
- Verifique se sitemap, canonical e redirecionamento de `www.violetta.com.br` permanecem corretos após cada publicação.

## Antes de abrir ou retomar vendas reais

- [ ] Confirmar o `INFINITEPAY_HANDLE` da conta correta no ambiente de produção do Supabase.
- [ ] Confirmar `PUBLIC_SITE_URL=https://violetta.com.br`.
- [ ] Confirmar que as Edge Functions `create-order`, `create-infinitepay-payment` e `infinitepay-webhook` estão implantadas na versão atual.
- [ ] Configurar na InfinitePay a URL de notificação exigida pela integração: `https://<PROJECT_REF>.supabase.co/functions/v1/infinitepay-webhook`.
- [ ] Fazer um pedido controlado e conferir o redirecionamento ao checkout InfinitePay.
- [ ] Confirmar que o webhook valida o pagamento pelo `payment_check`, confere o valor e atualiza o pedido uma única vez.
- [ ] Testar pagamento cancelado, falha de criação do link, repetição do webhook e pedido já pago.
- [ ] Verificar no painel que cliente, endereço, itens, frete, total, provedor e status de pagamento aparecem corretamente.
- [ ] Testar frete com CEP atendido, CEP fora da área, número do endereço e diferentes faixas de distância.
- [ ] Revisar os avisos de segurança do Supabase e confirmar que nenhum componente do checkout ainda chama os endpoints desativados do Mercado Pago.
- [ ] Definir o procedimento fiscal e de atendimento da operação.

## Publicação

- **Marca:** Violetta Joias e Semijoias
- **Domínio:** `violetta.com.br`
- **Hospedagem:** Vercel (produção)
- **Diretório de saída:** `dist/public`
- **Rotas:** `/loja` para clientes e `/gestao` para administração
