# Prompt para criar o site Simulado Gestor em Saúde — SES-TO

Crie uma aplicação web responsiva, em português do Brasil, para preparação do concurso SES-TO 2026, cargo Gestor em Saúde, nível superior. O produto deve funcionar como uma plataforma de simulados e acompanhamento de estudo, não como uma página institucional.

## Objetivo do produto

O site deve permitir que o candidato resolva uma bateria interativa de 50 questões específicas de Gestor em Saúde, uma por vez, receba correção após confirmar a alternativa, leia comentários da resposta certa e das erradas, acompanhe o aproveitamento e revise os erros acumulados.

## Banco inicial de questões

Criar 50 questões inéditas de múltipla escolha, com quatro alternativas A, B, C e D, apenas uma correta, distribuídas em quatro eixos:

| Eixo | Quantidade |
|---|---:|
| Gestão pública e estratégia | 18 |
| Gestão de pessoas e redes | 12 |
| Políticas públicas e gestão do SUS | 8 |
| Auditoria e legislação aplicada | 12 |

O conteúdo deve seguir os tópicos específicos do edital retificado: estratégia organizacional, cultura e mudança, gestão pública versus privada, participação, governo eletrônico, transparência, controle social, qualidade, planejamento estratégico, Balanced Scorecard, TIC, excelência, gestão por resultados, gestão por competências, comunicação, redes organizacionais, políticas públicas em saúde, auditoria, Lei nº 14.133/2021 e Portarias de Consolidação GM/MS nº 1 a 6/2017.

As questões devem ter nível de dificuldade misto, enunciados contextualizados, alternativas plausíveis, comparação entre conceitos, aplicação a situações de gestão pública e saúde e comentários baseados em fontes oficiais. Não copiar questões da FGV e não afirmar que uma questão foi criada pela FGV; usar apenas características gerais de cobrança de concurso.

## Fluxo do simulado

Na tela inicial, exibir a marca, a finalidade do produto, o progresso, o aproveitamento, os tópicos para revisar e um CTA específico, como “Resolver questão 01” ou “Retomar da questão 12”.

Ao iniciar, mostrar uma questão por vez. O candidato pode selecionar A, B, C ou D, confirmar a resposta e só então visualizar o feedback. Não mostrar o gabarito antes da confirmação.

Após cada resposta, exibir: resposta escolhida, gabarito, correto/incorreto, comentário da alternativa correta, análise das demais alternativas, eixo, tópico, dificuldade, fonte-base e aproveitamento acumulado.

Incluir navegação anterior/próxima, mapa de questões numerado de 1 a 50, estados de questão atual, respondida corretamente, respondida incorretamente e pendente. Permitir abrir qualquer questão pelo mapa sem perder o progresso.

## Monitoramento

Persistir o estado no navegador para manter respostas, questão atual, tempo de estudo, erros e progresso entre sessões. Mostrar no painel:

- questões respondidas, acertos, erros e aproveitamento geral;
- aproveitamento por eixo;
- aproveitamento por dificuldade;
- quantidade de tópicos no caderno de erros;
- gráfico de acertos, erros e pendentes;
- linha de progresso pelas fases diagnóstico, cobertura, consolidação e reta final;
- meta de segurança de 80%, sem confundir essa meta de estudo com o critério oficial do edital.

## Caderno de erros

Toda resposta incorreta deve entrar automaticamente no caderno de erros com questão, eixo, tópico, dificuldade e fonte. Exibir os tópicos recorrentes e uma ação recomendada de revisão. Incluir estado vazio quando ainda não houver erros.

## Fontes

Criar uma área de fontes com links externos para: edital retificado e página oficial da FGV; Gestão do SUS, PNS, PAS, RQPC e RAG do Ministério da Saúde; Auditoria do SUS e Manual de Auditoria Interna do DenaSUS; Lei nº 8.080/1990, Lei nº 8.142/1990, Decreto nº 7.508/2011, LC nº 141/2012 e Lei nº 14.133/2021 no Planalto; Portarias de Consolidação do Ministério da Saúde; gestão por competências da ENAP; transparência e participação social do Governo Digital.

Exibir um aviso de que o banco inicial deve ser validado na fonte oficial antes de ser tratado como material definitivo.

## Interface

Usar a direção visual “Caderno Clínico Editorial”: fundo off-white, azul-petróleo, verde-sálvia, azul-claro e coral para erros. Utilizar DM Sans ou Manrope em títulos, Source Serif 4 em enunciados e IBM Plex Mono em etiquetas, percentuais e identificadores.

A composição deve ter navegação lateral compacta, área de trabalho ampla, marcadores numerados, divisórias editoriais e visual de caderno de estudo. Evitar aparência genérica de SaaS, gradientes roxos, excesso de cards arredondados e blocos sem hierarquia.

Criar um símbolo sem texto que combine marcador de página vertical e pulso, usado no cabeçalho, na navegação e em superfícies de progresso. Usar microinterações curtas para seleção, avanço e feedback, respeitando `prefers-reduced-motion`.

## Navegação

A navegação deve conter: Visão geral, Simulado, Desempenho, Caderno de erros e Fontes de estudo. O botão de reiniciar progresso deve exigir confirmação ou ser claramente identificado como ação destrutiva.

## Comandos e acessibilidade

Garantir navegação por teclado, foco visível, contraste adequado, textos alternativos, labels acessíveis, responsividade para celular e desktop e ausência de rolagem horizontal em telas pequenas.

## Critérios de qualidade

Não inventar artigos, prazos ou competências legais. Não usar dados falsos de aprovação, depoimentos ou avaliações. Separar o conteúdo das questões da interface para facilitar atualização. Validar TypeScript/build, testar o fluxo iniciar → escolher → confirmar → comentar → próxima, testar reinício e verificar a persistência após recarregar a página.
