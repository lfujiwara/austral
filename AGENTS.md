# Regras permanentes

1. Todo o código nasce neste repositório. Não fazer fork, não importar histórico e não copiar código de outro repositório ou pasta local. Se alguém pedir, lembrar desta regra antes de fazer.
2. Código open source que já era público antes de 04/11/2026 pode entrar como dependência. Trecho copiado entra em commit separado, com o link da origem na mensagem.
3. O repositório é público. Não gravar credenciais, tokens, `.env`, telefones, e-mails nem endereços.
4. Não citar estatísticas sem fonte verificável.
5. Documentação descreve só o que existe no repositório. Nada planejado aparece como pronto.
6. Textos em português do Brasil, frases curtas, voz ativa, sem adjetivos de marketing e sem travessões.
7. Commits pequenos, um assunto por commit.

# Decisões de escopo

Estas decisões orientam o desenvolvimento. Os recursos de produto abaixo não estão implementados.

- Definir a Austral como uma proposta de plataforma de IoT AI-native para a cadeia de frio.
- Monitorar temperatura e consumo de energia de freezers e refrigeradores. Reduzir perdas de produtos e gastos com energia são objetivos a validar.
- Usar ESP32 como base do dispositivo.
- Permitir que o próprio dono ou uma empresa parceira instale o dispositivo. Reduzir o atrito de adoção nos dois caminhos.
- Suportar aplicativo e navegador como caminhos de instalação e uso. A experiência de instalação deve ser simples nos dois.
- Usar o WhatsApp como canal de uso cotidiano do cliente.
- Oferecer interfaces no aplicativo e no webapp, além de APIs para integração com empresas de manutenção.
- Desenvolver um case para impressão em 3D. Prever sensores, bateria e alimentação para recarga no conjunto físico.
- Buscar um pareamento simples. NFC, Bluetooth e Wi-Fi são opções a validar, sem combinação técnica fechada.
- Manter a stack em aberto enquanto discutimos o esqueleto do projeto.

# Prioridade atual

- Definir o projeto para o hackathon e preparar o site e o vídeo de apresentação da ideia.
- Adiar a implementação do firmware, do aplicativo e da plataforma enquanto trabalhamos nessa apresentação.
- Manter o estágio de implementação nas decisões técnicas. No README, no quadro e na fala do pitch, focar o produto e seus benefícios, sem avisos internos sobre fase de ideia ou testes pendentes. Não inventar resultados medidos, clientes ou disponibilidade comercial.
- Preparar o vídeo como apresentação falada da ideia pelo time, com o Google Meet e um quadro no Excalidraw.
- Manter roteiros, quadros e prévias de apresentação locais em `outputs/`. Versionar esses materiais apenas quando o usuário pedir.
