# Placa do termômetro Austral (fenolite face simples, 70 x 50 mm)

Feita a partir do esquema corrigido em `../docs/` (`ligacoes.md`, `esquema_austral.py`, `esquema-austral.png`).
Coube tudo em 70 x 50 mm, com **zero jumpers de fio**. O KiCad 9 passou sem nenhum erro de regra (DRC),
e uma checagem própria confirmou que as ligações batem com o esquema. Detalhes em `verificacao.txt`.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `1_cobre_TRANSFERENCIA_espelhado.pdf` | **A folha que você imprime e passa a ferro.** Tem 2 cópias, régua e moldura de corte. |
| `2_cobre_nao_espelhado_vista_do_cobre.pdf` | Como a placa pronta fica vista pelo lado do cobre. Só para conferir; não use para transferir. |
| `3_montagem_lado_componentes.pdf` | Onde vai cada peça, ampliado, com nomes, valores e polaridade dos bornes. |
| `3b_montagem_1para1.pdf` | A mesma vista em tamanho real, para pôr as peças em cima e conferir. |
| `4_mapa_de_furos.pdf` | Diâmetro de cada furo e quantidade. |
| `previa_chat.png` | Prévia: cobre e montagem lado a lado. |
| `fonte/` | Fontes: `layout.py` (posições e trilhas), projeto KiCad (`fonte/kicad/`), checagem e desenhos. Para regerar tudo: `fonte/gerar_tudo.sh`. |

Os PNG estão em 600 dpi. Para imprimir, prefira os PDF.

## Lista de peças

Na placa:
- 1 placa de fenolite cobreada **face simples**, de pelo menos 70 x 50 mm
- 1 ESP32 DevKit V1 DOIT de 30 pinos (você já tem)
- 2 barras de pinos **fêmea** 1x15, passo 2,54 mm (ou uma 1x40 cortada)
- 1 módulo MP1584EN (você já tem), mais 4 pernas de fio rígido (sobras de perna de resistor servem)
- Bornes KF301 de passo 5,0 mm, que encaixam lado a lado: 4 de 2 vias (J1, J4 e dois para formar o J3 de 4 vias) e 1 de 3 vias (J2)
- R1 de 4,7 kΩ, R2 de 1 kΩ e R3 de 2 kΩ, todos de 1/4 W. Se não achar 2 kΩ, um de 2,2 kΩ serve: o GPIO27 recebe cerca de 3,4 V, ainda dentro do limite.

Fora da placa, no fio da bateria:
- Porta-fusível de linha com fusível **1 A retardado** (T1A)
- Chave liga/desliga SPST
- BMS 2S e as duas 18650 (já previstos no esquema)

## Decisões tomadas

- **O fusível e a chave ficam no fio, fora da placa.** A ligação é: BMS P+ → porta-fusível → chave → borne J1 "BAT+". O BMS P− vai direto no J1 "BAT−". Motivos: a placa ficou cheia, a chave precisa estar na caixa onde a mão alcança, e o fusível de linha é fácil de trocar.
- **A ESP32 fica deitada no comprimento da placa**, com a USB para a borda esquerda e a antena para a direita, sem nada alto embaixo da antena.
- **Os três resistores ficam embaixo da ESP32.** É isso que permite rotear sem jumper: o R2 "pula" por cima da trilha do TRIG, fazendo o papel do arco do esquema. Como a ESP32 é encaixada, é só tirá-la para ver os resistores.
- **O 3V3 só vai ao resistor de 4,7 kΩ.** A sonda e o HC-SR04 recebem 5 V, e o pull-up do GPIO4 vai no 3V3, nunca no 5 V.
- **A ordem dos pinos nos bornes foi escolhida para não haver cruzamentos.** Siga a etiqueta impressa ao lado de cada parafuso:
  - J4 (reed): REED, GND. O reed não tem polaridade.
  - J3 (HC-SR04), de cima para baixo: **GND, ECHO, TRIG, VCC** (ordem invertida em relação ao sensor).
  - J2 (DS18B20): VDD (vermelho), DQ (amarelo), GND (preto). Confira as cores da sua sonda.
  - J1: BAT−, BAT+.
- **Regras de fabricação caseira:** trilhas de 1,0 mm (sinal) e 1,5 mm (5 V, bateria e GND), isolamento mínimo de 0,6 mm, ilhas de 2,2 mm e bornes com ilha de 2,6 mm.
  - Nos pinos da ESP32 a ilha é oval (1,9 x 2,6 mm), porque no passo de 2,54 mm uma ilha redonda de 2 mm deixaria menos de 0,6 mm entre pinos vizinhos.
  - Os pontos onde o cobre fica mais perto são esses pinos vizinhos da ESP32 (0,64 mm). Fora deles, nenhuma trilha fica a menos de 0,70 mm de outra rede.

## Antes de corroer, confira duas medidas

1. **Distância entre as duas fileiras de pinos da sua ESP32.** O desenho usa 25,4 mm, que é o padrão da DOIT de 30 pinos. Existem clones estreitos com 22,9 mm; se a sua for assim, me avise antes de fazer a placa.
2. **Furos do MP1584EN.** O desenho usa um retângulo de 18,9 x 13,3 mm, tirado de um footprint público do módulo comum. Imprima a folha `3b`, ponha o módulo em cima e veja se os furos e os nomes (IN+, IN−, OUT+, OUT−) batem. Se não baterem, ligue o módulo com 4 fios curtos nos mesmos furos e prenda com fita dupla face: o circuito continua igual.

## Como imprimir (impressora laser Lexmark)

1. Abra `1_cobre_TRANSFERENCIA_espelhado.pdf`.
2. Na janela de impressão, escolha **"Tamanho real"** ou **escala 100%**. **Desmarque** "Ajustar à página" e "Reduzir páginas grandes".
3. Nas propriedades da Lexmark, escolha a qualidade máxima e o toner mais escuro (tonalidade 8 a 10, ou 1200 dpi), sem economia de toner.
4. Imprima numa folha comum primeiro e **meça com uma régua**: a barra preta tem de dar 10 mm, e a moldura, 70 x 50 mm. Se der diferente, a impressão saiu fora de escala; corrija antes de continuar.
5. Depois imprima no papel de transferência (papel glossy/couchê ou papel de revista).
6. Na folha de transferência, o texto **AUSTRAL sai ao contrário. Está certo**: depois de passado para o cobre, ele lê normal.

## Ordem de fabricação e montagem

1. Lixe o cobre com palha de aço fina e limpe com álcool. Não toque mais com os dedos.
2. Corte a placa pela moldura preta (a linha fica do lado de fora).
3. Ponha a folha com o toner virado para o cobre e passe o ferro bem quente por 3 a 5 minutos, com pressão. Deixe esfriar, molhe e tire o papel esfregando de leve.
4. Retoque falhas com caneta permanente e corroa no percloreto. Lave bem e tire o toner com palha de aço ou acetona.
5. Fure pelo lado do cobre, usando os pontinhos brancos como guia: broca de 0,8 mm nos resistores, 1,0 mm na ESP32 e no MP1584, e 1,2 mm nos bornes (veja o mapa de furos).
6. **Teste com o multímetro no modo de continuidade:** 5 V com GND, 3V3 com GND e BAT+ com GND **não podem apitar**. Use as etiquetas da folha de montagem para achar os pontos.
7. Solde primeiro os **resistores R1, R2 e R3** (eles ficam embaixo da ESP32).
8. Solde as **duas barras fêmea**. Dica: encaixe as barras na ESP32, apoie tudo na placa, solde só as duas pontas de cada barra, tire a ESP32 e termine os outros pinos.
9. Solde os **bornes**, com a entrada do fio virada para fora da placa.
10. Solde o **MP1584EN** sobre as 4 pernas, uns 3 mm acima da placa. Ele não pode encostar nas trilhas.
11. **Sem a ESP32 encaixada**, ligue a bateria (passando pelo fusível e pela chave) e gire o trimpot até medir **5,00 V** entre VDD e GND do J2. Desligue.
12. Encaixe a ESP32 com a **USB para a esquerda** (lado do MP1584) e os componentes para cima. O pino VIN fica no canto ao lado do MP1584.
13. Ligue a sonda, o HC-SR04 e o reed nos bornes, seguindo as etiquetas.

**Nunca ligue o USB e a bateria ao mesmo tempo.**
