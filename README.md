# Karine Joias

Sistema web de gestão para loja de joias e semi-joias. A aplicação foi criada para uso pessoal da proprietária e funciona diretamente no navegador, sem backend obrigatório.

## Recursos

- Dashboard com saldo, vendas, estoque baixo, aniversariantes e promoções.
- Registro de vendas com cliente, produto e forma de pagamento.
- Fluxo de caixa com entradas e saídas.
- Cadastro de produtos com margem e alerta de estoque.
- Cadastro de clientes com classificação e contato via WhatsApp.
- Promoções com cupom, vigência e ativação/desativação.
- Relatórios de vendas, pagamentos, clientes e produtos.
- Dados seed para começar a usar imediatamente.
- Backup JSON pelo botão `Backup` no topo.
- Modo escuro opcional.

## Como executar

```bash
pnpm install
pnpm dev
```

Abra a URL exibida pelo Vite. Para uma build de produção:

```bash
pnpm build
pnpm start
```

## Dados e backup

Os dados ficam no `localStorage` do navegador, separados por chaves `kj-*`. Para fazer backup, clique em **Backup** no topo e salve o arquivo JSON. A restauração pode ser feita futuramente importando esse arquivo pela ferramenta de restauração planejada.

## Stack

React + TypeScript + Vite, Lucide Icons e CSS responsivo com identidade visual em dourado, rosé, branco e cinza escuro.
