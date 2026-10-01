# Direção visual — Simulado Gestor em Saúde SES-TO

## Abordagens consideradas

### Tema 1: Caderno Clínico Editorial
Interface clara, editorial e acadêmica, combinando azul-petróleo, creme e verde-sálvia. A intenção é transmitir foco, método e confiança, como um caderno de preparação bem organizado.

**Probabilidade:** 0,07

### Tema 2: Sala de Controle de Desempenho
Dashboard sofisticado e operacional, com fundo azul-noturno, acentos ciano e superfícies translúcidas. A intenção é transformar o estudo em um sistema de acompanhamento de performance.

**Probabilidade:** 0,04

### Tema 3: Atlas do SUS
Linguagem visual inspirada em mapas, fluxos e sistemas públicos: azul profundo, verde institucional, linhas de conexão e módulos em camadas. A intenção é representar a complexidade do SUS de forma navegável.

**Probabilidade:** 0,09

## Abordagem escolhida: Caderno Clínico Editorial

### Design Movement
Editorial information design com influência de cadernos de campo, relatórios de saúde pública e tipografia de sinalização institucional.

### Core Principles
1. **Clareza operacional:** cada tela responde rapidamente “onde estou?”, “o que preciso fazer?” e “como estou evoluindo?”.
2. **Densidade com respiro:** dados e métricas aparecem em blocos compactos, separados por espaços funcionais, sem excesso de decoração.
3. **Correção como aprendizagem:** feedback, comentários e erros ficam visualmente tão importantes quanto o enunciado.
4. **Ritmo de estudo:** a interface usa progressão, estados e microinterações para transformar constância em sensação de avanço.

### Color Philosophy
O azul-petróleo comunica confiança e estabilidade; o verde-sálvia funciona como assinatura de saúde, acerto e recuperação; o creme reduz a dureza de uma interface de prova; o coral é reservado para atenção, erro e ação pendente. A paleta deve parecer institucional, mas não burocrática.

### Layout Paradigm
Estrutura assimétrica com navegação lateral compacta e uma área de trabalho principal ampla. O dashboard começa com contexto e progresso, depois conduz para ação. A tela de prova usa uma coluna de enunciado e um trilho lateral de progresso, permitindo foco sem perder orientação.

### Signature Elements
- Marcador vertical verde-sálvia com numeração de questão e eixo do edital.
- “Linha de estudo” horizontal, com pontos para diagnóstico, cobertura, consolidação e reta final.
- Blocos editoriais com rótulos em caixa alta, divisórias finas e pequenos índices monoespaçados.

### Interaction Philosophy
As interações devem ser calmas e confirmatórias. Responder uma alternativa revela o feedback com clareza, salva automaticamente o progresso e oferece uma próxima ação. Estados vazios instruem sem culpar. O erro é tratado como dado de aprendizagem, não como punição.

### Animation
Usar transições curtas de 160–220ms para seleção de alternativas, avanço de progresso e abertura de comentários. Usar entrada suave de 300ms para painéis, respeitando `prefers-reduced-motion`. Não animar métricas continuamente nem criar efeitos que distraiam durante a prova.

### Typography System
- **Display:** DM Sans ou Manrope, peso 700–800, para títulos e números de destaque.
- **Body:** Source Serif 4, peso 400–600, para enunciados, comentários e textos longos.
- **Utility:** IBM Plex Mono, peso 500–700, para etiquetas, percentuais, códigos de questão e status.

### Brand Essence
Uma sala de estudos digital para transformar o edital da SES-TO em prática mensurável, feita para candidatos que querem saber exatamente o que revisar e por quê.

**Personalidade:** metódica, acolhedora, exigente.

### Brand Voice
Headlines e CTAs devem ser diretos, encorajadores e específicos. Evitar frases genéricas como “comece sua jornada”.

- “Seu próximo ganho está nos erros recorrentes.”
- “Resolver 10 questões agora vale mais do que reler 30 páginas sem medir.”

### Wordmark & Logo
Marca gráfica formada por um marcador de página vertical atravessado por uma linha de pulso discreta, sem texto. O símbolo deve funcionar como favicon, ícone do cabeçalho e assinatura dos cartões de progresso.

### Signature Brand Color
**Verde-sálvia ativo — #54B99A.** É a cor própria do produto: representa saúde, evolução e uma resposta correta sem recorrer ao verde neon ou ao azul genérico.

## Decisão de implementação

O produto será uma aplicação frontend estática, com persistência local no navegador para manter respostas, progresso, erros e histórico entre sessões. O conteúdo inicial terá 50 questões demonstrativas estruturadas para o edital específico, e a arquitetura manterá os dados separados da interface para facilitar a substituição por um banco validado posteriormente.

## Style Decisions

- O símbolo bookmark + pulso aparecerá no cabeçalho principal e em uma superfície de progresso, reforçando reconhecimento de marca.
- A ilustração do hero será tratada como artefato editorial de estudo, não como imagem médica genérica.
- As telas principais manterão a orientação de workspace por meio da navegação lateral e de marcadores indexados de questão.
- CTAs deverão ser específicos para o resultado de estudo, como “Retomar da questão 01” ou “Revisar tópicos fracos”, em vez de chamadas genéricas.
