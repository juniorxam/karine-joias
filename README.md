# Violetta Joias e Semijoias

Aplicação de gestão e loja virtual da Violetta Joias e Semijoias.

## Arquitetura

- **Frontend:** React + TypeScript + Vite.
- **Administração:** `/gestao`, com autenticação Supabase e dados sincronizados no PostgreSQL. A raiz `/` continua apontando para o painel por compatibilidade.
- **Loja pública:** `/loja`, catálogo publicado, carrinho, checkout, cupons e acompanhamento do pedido.
- **Pagamentos:** Mercado Pago Checkout Pro + webhook assinado.
- **Frete:** cálculo próprio da Violetta para Palmas-TO e frete a combinar para demais localidades. Melhor Envio não faz parte do checkout atual.
- **Banco:** Supabase Postgres com RLS e funções de serviço para operações sensíveis.
- **Hospedagem planejada:** Vercel para o frontend e Edge Functions do Supabase para o backend de checkout/integrações.

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

Frontend:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STORE_WHATSAPP=
```

Segredos de backend devem ficar somente nas Edge Functions/Supabase, nunca no frontend:

```
SUPABASE_SERVICE_ROLE_KEY=
MP_ACCESS_TOKEN=
MP_WEBHOOK_KEY=
PUBLIC_SITE_URL=https://violetta.com.br
```

## Fluxo da loja

1. Cliente escolhe uma peça em `/loja`.
2. Produto é adicionado ao carrinho.
3. Checkout coleta dados do cliente e endereço.
4. A Violetta calcula o frete de Palmas-TO por distância ou apresenta frete a combinar.
5. O pedido é criado no Supabase com validação de estoque, frete e cupom.
6. Mercado Pago gera o Checkout Pro.
7. O webhook assinado reconcilia o pagamento.
8. A proprietária acompanha o pedido no painel.
9. A equipe acompanha o pedido e, quando aplicável, registra o envio/rastreamento pelo painel.

## Segurança

A aplicação usa RLS, autenticação e funções de banco para operações sensíveis. O frontend nunca deve receber `SUPABASE_SERVICE_ROLE_KEY` nem o token do Mercado Pago.

O projeto também possui o Edge Function `production-healthcheck`, acessível para usuário autenticado no painel, para verificar a configuração de produção e conectividade com o Mercado Pago.

### Atenção aos avisos do Supabase

Os avisos do Security Advisor precisam ser tratados conforme o modelo de acesso da aplicação. Em especial, tabelas administrativas não devem ser tornadas públicas apenas para eliminar um alerta. O catálogo `public_products` é intencionalmente consultável por visitantes da loja; já dados administrativos devem permanecer protegidos por autenticação/RLS.

## SEO

A vitrine define metatags, canonical, Open Graph e dados estruturados de produto/loja em runtime. O arquivo `robots.txt` permite indexação da vitrine e bloqueia checkout e acompanhamento de pedidos.

O domínio definitivo é `https://violetta.com.br`; `PUBLIC_SITE_URL` deve permanecer apontando para ele.

## Antes de abrir vendas reais

- Configurar domínio próprio e HTTPS.
- Configurar `PUBLIC_SITE_URL` com o domínio definitivo.
- Usar credenciais de produção do Mercado Pago.
- Configurar e testar o webhook de pagamentos.
- Executar o diagnóstico de produção no painel.
- Fazer um pedido controlado ponta a ponta.
- Confirmar estoque, pagamento, frete e rastreamento.
- Definir o procedimento fiscal da operação.


## Publicação
- Marca: Violetta Joias e Semijoias
- Domínio definitivo: `violetta.com.br`
- Ambiente: Vercel (produção)
- Diretório de saída do Vercel: `dist/public`
- Rotas públicas: `/loja` para clientes e `/gestao` para a proprietária
