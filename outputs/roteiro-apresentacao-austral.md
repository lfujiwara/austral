# Roteiro da apresentação da ideia Austral

Rascunho para uma fala de 2 a 3 minutos no Google Meet, com o Excalidraw na tela. A apresentação é para o Hack Brasil 2026, na trilha Logística e automação. O projeto ainda está na fase de ideia.

## Abertura e problema

Aponte para o título e para o equipamento.

A Austral é uma proposta de plataforma de IoT AI-native para a cadeia de frio. Ela combina temperatura e consumo de energia para ajudar a reduzir perdas de produtos e gastos com energia.

Queremos começar por freezers e refrigeradores de mercados, bares e restaurantes. Um equipamento pode parar de refrigerar sem o dono perceber. Quando ele descobre, o estoque já pode ter estragado. A ideia é avisar pelo WhatsApp e ajudar a chamar manutenção.

## Produto físico

Aponte para o equipamento e para as notas do dispositivo e da instalação.

A gente vai usar uma sonda de temperatura e uma tomada que mede o consumo de energia. O dispositivo terá um ESP32 dentro de um case impresso em 3D, com bateria e recarga. A instalação deve ter poucas etapas, pelo aplicativo ou navegador. O dono pode fazer sozinho ou contar com um parceiro.

## Análise dos sinais

Aponte para a Austral.

Vamos acompanhar como a temperatura e o consumo mudam ao longo do tempo para tentar entender a causa de um problema. Ainda precisamos testar como distinguir uma porta aberta, falta de energia e perda de eficiência. A análise também precisa considerar reposição de estoque e perda de comunicação para evitar avisos indevidos.

## Conversa pelo WhatsApp

Aponte para o dono.

O dono vai usar o WhatsApp no dia a dia. Quando houver um problema, ele receberá um aviso com a causa provável e o valor do estoque em risco, a partir do valor que cadastrou. Na mesma conversa, poderá informar que está repondo o estoque, consultar o equipamento ou pedir manutenção.

## Atendimento e encerramento

Aponte para a manutenção.

A empresa de manutenção receberá o chamado. O técnico terá um laudo com os gráficos, o modelo do equipamento e o histórico de reparos. A empresa poderá acompanhar o atendimento pelo webapp ou integrar seu sistema pelas APIs da Austral.

## Uso do quadro

Abra o arquivo austral-apresentacao.excalidraw no Excalidraw e compartilhe a aba pelo Meet. Deixe o quadro inteiro visível e use o cursor para acompanhar a fala, da esquerda para a direita. Use as notas de baixo como apoio, sem ler tudo em voz alta.

Uma pessoa pode apresentar tudo. Para dividir a fala entre o time, uma pessoa apresenta o problema e o dispositivo. Outra explica a análise e o WhatsApp. A terceira apresenta o atendimento pela manutenção.
