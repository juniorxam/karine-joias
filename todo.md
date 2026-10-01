# Migração para autenticação e banco em nuvem

- [x] Ler a documentação do projeto full-stack e definir o modelo de dados.
- [x] Adicionar o recurso full-stack com autenticação, backend e banco.
- [x] Criar o modelo de progresso por usuário e as operações de leitura e gravação.
- [x] Integrar login, logout e carregamento do progresso no simulador.
- [x] Migrar o progresso existente do localStorage para a conta do usuário.
- [x] Implementar sincronização segura entre dispositivos.
- [x] Testar sessão, isolamento de dados e recuperação após recarregar.
- [x] Criar checkpoint e orientar o usuário sobre o primeiro acesso.

- [x] Tornar a sincronização em nuvem resistente a conflitos e falhas: comparar updatedAt, evitar sobrescrever remoto quando o get falhar e exibir estado/erro de sincronização.
- [x] Adicionar testes cobrindo sessão autenticada, isolamento por usuário, restauração após reload e cenário de sincronização entre dispositivos/logins distintos.

- [x] Salvar um novo checkpoint após a integração de autenticação/nuvem e entregar instruções de primeiro login e migração.
- [x] Exibir indicador visível de sincronização no cabeçalho e tratar erro no primeiro salvamento quando não houver progresso remoto.
- [x] Adicionar teste de conflito entre duas sessões do mesmo usuário usando precedência baseada em updatedAt.

- [x] Salvar um novo checkpoint após a integração de autenticação/nuvem.
- [x] Entregar ao usuário instruções de primeiro login, migração do progresso local e limitações da sincronização.

- [x] Enviar ao usuário uma mensagem final com instruções de primeiro login, migração do progresso local e limitações da sincronização.

- [x] Mapear a apostila aos quatro eixos e aos tópicos específicos de Gestor em Saúde.
- [x] Redigir a apostila em Markdown com linguagem adequada para leitura e áudio no NotebookLM.
- [x] Criar prompts para podcasts diários, revisão, perguntas e simulados.
- [x] Revisar fontes, estrutura e entregar os arquivos finais.

- [x] Fazer uma revisão final explícita dos arquivos da apostila e do kit, conferindo estrutura, referências e adequação ao NotebookLM.
- [x] Entregar ao usuário os arquivos finais da apostila e do kit de prompts/podcast em uma mensagem de resultado com os anexos corretos.

- [x] Revisar integralmente a apostila e o kit final, conferindo todo o conteúdo, a seção de referências e as instruções de uso no NotebookLM.
- [x] Enviar ao usuário uma mensagem final de resultado com os arquivos da apostila e do kit anexados.

- [x] Revisar integralmente a apostila e o kit, lendo todo o conteúdo final e conferindo coerência, referências, instruções de uso no NotebookLM e alinhamento com os quatro eixos do questionário.
- [x] Enviar ao usuário uma mensagem final de resultado com os arquivos da apostila e do kit anexados.

- [x] Reproduzir no simulador o modelo de prova do site de referência: cabeçalho compacto, contador, questão central, alternativas, navegação, painel, revisão e comandos.
- [x] Embaralhar a ordem das 50 questões a cada nova abertura ou novo simulado, mantendo a sequência durante a sessão atual.
- [x] Preservar respostas, correção, caderno de erros, autenticação e sincronização sem quebrar o histórico.
- [x] Adicionar testes para embaralhamento, estabilidade da ordem na sessão e restauração do progresso.
- [x] Validar desktop/mobile e publicar a atualização.

- [x] Implementar comandos rápidos no simulador no estilo do site de referência, incluindo PAINEL, REVISÃO, REFAZER, SIMULADO e FONTES.
- [x] Adicionar teste cobrindo estabilidade e restauração da ordem salva quando há progresso.
- [x] Salvar novo checkpoint e publicar a atualização com embaralhamento.

- [x] Analisar o site de referência e identificar o formato do banco de questões.
- [x] Confirmar a origem/autorização do conteúdo antes de reproduzir integralmente as questões.
- [x] Mapear perguntas, alternativas, gabaritos, comentários e temas para o simulador.
- [x] Substituir o banco atual preservando embaralhamento, respostas, correção e desempenho.
- [x] Testar o novo banco e publicar a atualização.

- [x] Mapear e exibir os comentários por alternativa do banco de referência na correção do simulador.
- [x] Adicionar e exibir um tema específico por questão, além do eixo geral.

- [x] Publicar um novo checkpoint após a migração das 50 questões do site de referência.
- [x] Exibir na correção os comentários das quatro alternativas, não apenas da alternativa escolhida.
- [x] Adicionar um tema real por questão no banco importado e exibi-lo na interface.

- [x] Revisar manualmente os 50 temas atribuídos às questões e corrigir rótulos genéricos ou inadequados.
- [x] Salvar novo checkpoint e publicar a versão final com o banco do site de referência.

- [x] Publicar a versão final após a migração e revisão dos 50 temas do banco de referência.

- [x] Definir o reset como limpeza de respostas, pontuação, caderno de erros, posição, tempo e ordem da sessão, preservando conta e questões.
- [x] Criar procedimento protegido para apagar o progresso remoto do usuário.
- [x] Adicionar confirmação visual e botão separado para limpar histórico.
- [x] Testar limpeza local, remota e geração de nova ordem de questões.
- [x] Publicar a atualização e orientar o uso.

- [x] Adicionar testes do fluxo completo de limpar histórico: reset local, chamada remota bem-sucedida e nova ordem.
- [x] Validar no navegador que respostas, acertos e erros desaparecem sem apagar a conta.
- [x] Salvar checkpoint/publicar a função de apagar histórico.
- [x] Enviar instruções finais de uso do botão e do efeito local/nuvem.

- [x] Criar uma função pura de estado inicial do reset e testá-la junto com a chamada protegida `progress.clear`.
- [x] Confirmar visualmente o estado zerado e a conta conectada após o reset.
- [x] Publicar um checkpoint após a implementação do apagar histórico.
- [x] Entregar as instruções finais ao usuário.

- [x] Auditar a interface atual e definir as melhorias prioritárias de estudo.
- [x] Criar uma área visível de Configurações/Minha conta com o apagar histórico.
- [x] Adicionar confirmação explícita e feedback de conclusão do reset.
- [x] Implementar melhorias prioritárias para diagnóstico, revisão e modo prova.
- [x] Testar, publicar e orientar o novo fluxo.

- [x] Implementar um plano automático de revisão baseado nos temas com mais erros.
- [x] Publicar o novo painel de configurações e o plano de revisão.
- [x] Entregar ao usuário instruções finais sobre o novo fluxo e as prioridades de estudo.

- [x] Adicionar na Visão geral um painel visível de controle do progresso com o botão Apagar histórico.
- [x] Validar visualmente desktop/mobile e confirmar que o reset continua local e remoto.
- [x] Publicar a atualização e orientar o novo local do botão.

- [x] Capturar a Visão geral em desktop e mobile após mover o botão.
- [x] Validar o fluxo do reset a partir da Visão geral e confirmar a limpeza local/remota.
- [x] Publicar o checkpoint da nova localização e orientar o usuário.

- [x] Criar uma ordem de alternativas por questão e persistir essa ordem durante a sessão.
- [x] Embaralhar alternativas em nova sessão/reset e remapear gabarito e comentários.
- [x] Testar que as letras corretas variam, sem alterar a resposta conceitualmente correta.
- [x] Validar restauração do progresso, publicar e orientar o usuário.

- [x] Validar explicitamente a restauração de `alternativeOrders` em progresso local e remoto.
- [x] Publicar o checkpoint com alternativas embaralhadas por sessão.
- [x] Orientar o usuário sobre nova sessão, reset e preservação da ordem durante o estudo.
