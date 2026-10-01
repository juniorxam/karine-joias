# Vitrine pública Karine Joias

## Objetivo
Criar uma versão pública para clientes acessarem os produtos em `/loja`, sem exigir login e sem expor o painel de gestão.

## Abordagem
- Manter o painel atual e suas tabelas Supabase privadas, protegidas por RLS.
- Adicionar uma tela pública independente com identidade visual da marca.
- Exibir catálogo com busca, filtros por categoria, cards de produto, destaque de coleção e CTA para atendimento via WhatsApp.
- Consultar uma coleção pública opcional no Supabase; enquanto ela não estiver configurada, usar os produtos-base já existentes como fallback para a vitrine não ficar vazia.
- Preparar migração separada para produtos publicados, sem alterar nem remover dados existentes.

## Design
- **Movimento:** editorial boutique contemporâneo, inspirado em vitrines de joalheria e catálogos de moda.
- **Princípios:** elegância silenciosa, foco no produto, ritmo editorial e contato humano.
- **Cores:** marfim e areia para acolhimento; dourado como assinatura; grafite para contraste e sofisticação; rosé como detalhe de calor.
- **Layout:** cabeçalho amplo, hero assimétrico, filtros horizontais e catálogo modular; evitar a sensação de dashboard.
- **Elementos-assinatura:** selo circular dourado, molduras suaves de produto e microdetalhes em linha fina.
- **Interação:** busca e filtros instantâneos, cards com CTA claro e navegação que reduz a distância até o WhatsApp.
- **Animação:** entradas discretas, hover com elevação mínima e transições curtas; nada que prejudique a percepção premium.
- **Tipografia:** Playfair Display para títulos e DM Sans para leitura, mantendo a identidade atual.
- **Essência:** joias com presença delicada para mulheres que escolhem detalhes com intenção. Personalidade: delicada, segura, próxima.
- **Voz:** “Escolha o detalhe que fica.” / “Se apaixonou por uma peça? Fale com a Karine.”
- **Marca:** wordmark Karine com serif editorial e assinatura JOIAS espaçada; símbolo de gema circular.
- **Cor proprietária:** dourado Karine `#C9A961`.

## Estrutura
- `client/src/Storefront.tsx`: página pública e estados de busca/filtro.
- `client/src/lib/catalog.ts`: tipos, fallback de produtos e normalização do catálogo.
- `client/src/lib/publicCatalog.ts`: leitura opcional da tabela pública, sem uso de service role.
- `supabase/migrations/002_public_catalog.sql`: tabela pública separada e política de leitura anônima apenas para itens publicados.
- `client/src/App.tsx`: roteamento de `/loja` antes do bloqueio de autenticação do painel.
- `client/src/index.css`: estilos da vitrine responsiva.
- `manus-routes.json`: declaração da nova rota pública.
