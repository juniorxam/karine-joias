# Vitrine pública Violetta

## Objetivo
Manter a identidade editorial rosa da Violetta e reorganizar a home pública `/loja` para uma experiência de ecommerce mais comercial, inspirada na organização de vitrines da Francisca Joias, sem copiar identidade, conteúdo ou ativos.

## Abordagem
- Preservar painel, checkout, Supabase, carrinho, WhatsApp e rotas existentes.
- Reordenar a home para: banner/campanha principal, categorias, lançamentos/coleção temática, subcategorias rápidas, mais vendidos, banner promocional intermediário, novidades, presentes e catálogo completo.
- Usar os dados já publicados em `public_products` e as configurações existentes de `storefront_settings`.
- Manter busca, filtros por categoria, ordenação e navegação para detalhe do produto.
- Enriquecer os cards com selo, preço no Pix, indicação de parcelamento e desconto quando houver preço comparativo configurado.
- Não alterar tema, paleta, tipografia, logotipo ou regras de checkout.

## Design
- **Movimento:** editorial boutique contemporâneo, inspirado em vitrines de joalheria e catálogos de moda.
- **Princípios:** elegância silenciosa, foco no produto, ritmo editorial e conversão sem ruído.
- **Cores:** marfim, rosa e grafite da Violetta; dourado permanece apenas como detalhe já existente.
- **Layout:** hero amplo, blocos de categorias, faixa de subcategorias, vitrines de produtos, banner intermediário e catálogo modular.
- **Elementos-assinatura:** tipografia Playfair Display, linhas finas rosa, cards claros, selo de produto e CTA rosé.
- **Interação:** atalhos de subcategoria filtram o catálogo e levam o cliente diretamente à coleção.
- **Animação:** hover discreto, elevação mínima dos cards e transições curtas.
- **Tipografia:** Playfair Display para títulos e DM Sans para leitura e controles.
- **Essência:** joias com presença delicada para mulheres que escolhem detalhes com intenção.

## Estrutura
- `client/src/Storefront.tsx`: ordem da home, atalhos de subcategorias e hierarquia comercial dos cards.
- `client/src/lib/catalog.ts`: campos opcionais para preço Pix, preço comparativo e parcelamento.
- `client/src/index.css`: estilos da faixa de subcategorias e dos blocos de preço dos cards.
- `client/src/App.tsx`: permanece sem alteração funcional.
- `manus-routes.json`: permanece sincronizado com as rotas existentes.
