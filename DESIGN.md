---
name: Austral
description: Página de apresentação da Austral.
colors:
  ink: "#163f35"
  paper: "#f5f8f3"
  muted: "#4f685e"
  accent: "#d7f39b"
  line: "#cedbd0"
  chat: "#edf3e8"
  muted-on-dark: "#d0e6d8"
  white: "#ffffff"
  headline-accent: "#4b7135"
  focus: "#668f31"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(43px, 5.1vw, 70px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(28px, 3vw, 38px)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  panel: "24px"
  button: "100px"
  topic: "50px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "18px 23px"
  topic:
    textColor: "{colors.ink}"
    rounded: "{rounded.topic}"
    padding: "12px 14px"
    typography: "{typography.label}"
  topic-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.topic}"
    padding: "12px 14px"
    typography: "{typography.label}"
  conversation:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.panel}"
---

# Design da Austral

## Overview

**Creative North Star: "Conversa da Austral"**

Página de venda curta. Mantém o verde e a relação com o WhatsApp do quadro da Austral. O cliente pediu comunicação positiva e delegou a escolha visual.

Títulos grandes apresentam o benefício. Um painel de conversa permite explorar estoque, energia e manutenção. A faixa escura abaixo explica o percurso do cliente.

**Key Characteristics:**
- Verde escuro sobre fundo claro.
- Tipografia Manrope e títulos com entrelinha curta.
- Painel de conversa com temas selecionáveis.

## Colors

O verde escuro concentra texto, botão principal e fundos de contraste. O verde claro destaca o avatar, os ícones e o indicador da conversa. O fundo claro separa a apresentação da faixa do produto.

O texto secundário usa o token `muted` em fundos claros e `muted-on-dark` na faixa escura. O foco de teclado usa o token `focus`.

## Typography

Manrope, hospedada no próprio site. Títulos grandes, peso 700 e entrelinha curta. Texto de apoio com entrelinha de 1,75. Títulos da faixa do produto usam peso 600. Rótulos pequenos identificam os temas e o público.

## Layout

Duas colunas no desktop. O conteúdo ocupa até 1200px, com margens laterais de 48px. Abaixo de 1050px, as margens passam a 32px. Abaixo de 700px, o conteúdo fica em uma coluna, com margens de 20px. As três etapas também passam para uma coluna.

## Elevation & Depth

O painel de conversa usa uma sombra difusa e uma rotação de 2 graus. No celular, a rotação cai para 1,2 grau. A preferência por movimento reduzido remove a rotação, as transições e a rolagem suave.

## Shapes

O painel de conversa usa cantos arredondados de 24px. O botão principal e os temas usam contornos de cápsula. O balão branco tem o canto superior esquerdo reto e os outros cantos arredondados.

## Components

O botão principal leva à seção do produto. Seu fundo clareia ao passar o ponteiro. Os temas da conversa alternam texto local e indicam a seleção com fundo escuro e `aria-pressed`.

O cabeçalho reúne a marca e um link para o produto. A faixa inferior apresenta três etapas com ícones lineares. Foco de teclado visível e anúncio das mudanças da conversa atendem leitores de tela.

## Do's and Don'ts

### Do:
- Use Manrope e os tokens de cor presentes no CSS.
- Mantenha o foco de teclado visível nos links e botões.
- Respeite a preferência por movimento reduzido.
- Apresente a conversa como exploração local dos benefícios.

### Don't:
- Não trate os botões da conversa como envio de mensagens.
- Não substitua os ícones lineares por caracteres de texto.
