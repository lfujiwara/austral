# Ligações — termômetro Austral (branch anderson)

Pinos de GPIO conferidos em `device/firmware/device.yaml` (e nos packages `display.yaml` / `buzzer.yaml`) do repositório [lfujiwara/austral](https://github.com/lfujiwara/austral), branch `anderson`. A alimentação e o arranjo VDD=5 V + pull-up no 3V3 não estão no firmware: seguem o pedido do Anderson e o datasheet do DS18B20.

## Alimentação

| De | Para | Nota |
|---|---|---|
| 2× 18650 Alfacell em série (2S) | BMS 2S (B+, B−) | Pack de 6 a 8,4 V |
| BMS 2S P+ | Fusível 1 A retardado | **A instalar** |
| Fusível | Chave SPST | **A instalar**, no positivo, nesta ordem |
| Chave | IN+ do MP1584EN | Trimpot ajustado em 5,00 V |
| BMS 2S P− | IN− do MP1584EN | Negativo direto, sem fusível nem chave |
| OUT+ do MP1584EN | Barramento 5 V | VIN da ESP32, VCC do HC-SR04 e VDD do DS18B20 |
| OUT− do MP1584EN | GND comum | |

Nunca ligue o USB e a bateria ao mesmo tempo.

## ESP32 DevKit V1 (DOIT, 30 pinos)

| Pino | Ligação |
|---|---|
| VIN | 5 V (OUT+ do MP1584) |
| GND | GND comum |
| 3V3 | Só o pull-up de 4,7 kΩ do DS18B20 (saída do regulador da placa) |
| GPIO4 | DQ do DS18B20 (1-Wire) |
| GPIO26 | TRIG do HC-SR04 |
| GPIO27 | ECHO do HC-SR04, depois do divisor 1 kΩ / 2 kΩ |
| GPIO33 | Reed switch MC-38 (o outro fio no GND; pull-up interno no firmware) |
| GPIO25 | Buzina — **desligada** no firmware (`buzzer_off.yaml`); não ligar |
| GPIO21 / GPIO22 | SDA / SCL da OLED 128×32 — **desligada** no firmware (`display_off.yaml`); não ligar |

## DS18B20

| Pino da sonda | Ligação |
|---|---|
| VDD | 5 V (OUT+ do MP1584) |
| DQ | GPIO4, com resistor de **4,7 kΩ entre DQ/GPIO4 e o 3V3** (nunca no 5 V: o GPIO da ESP32 não tolera 5 V) |
| GND | GND comum |

Cores comuns da sonda (confira na sua): vermelho = VDD, amarelo = DQ, preto = GND.

**Datasheet Maxim/Analog DS18B20, documento 19-7487, Rev 6 (7/19), tabela *DC Electrical Characteristics*:** VDD em alimentação local 3,0–5,5 V; VPU (pull-up) em alimentação local de 3,0 V até VDD; VIH local mínimo +2,2 V (máximo: o menor entre 5,5 V e VDD + 0,3 V). Com VDD = 5 V e pull-up em 3,3 V, os níveis estão dentro da especificação (3,3 V ≥ 2,2 V e 3,0 V ≤ 3,3 V ≤ 5 V). A nota 8 avisa que, para minimizar a corrente de espera, o DQ deveria ficar perto de GND ou a menos de 0,3 V de VDD; em 3,3 V com VDD de 5 V essa corrente pode ser maior que os 750–1000 nA do datasheet, sem tirar os níveis lógicos da faixa.

## HC-SR04

| Pino | Ligação |
|---|---|
| VCC | 5 V |
| TRIG | GPIO26 (direto) |
| ECHO | 1 kΩ em série até o GPIO27; 2 kΩ do GPIO27 ao GND (o Echo sai em 5 V; o divisor entrega cerca de 3,3 V) |
| GND | GND comum |

## Reed switch MC-38

Dois fios, sem polaridade: um no GPIO33, o outro no GND. Contato NA. O firmware liga o pull-up interno. Ímã na porta.

## Divergências em relação ao `device.yaml`

- O firmware não descreve a alimentação (pack, BMS, fusível, chave, MP1584) nem o VDD da sonda.
- O pull-up de 4,7 kΩ não aparece no YAML (é peça de hardware).
- O divisor 1 kΩ / 2 kΩ só está num comentário do `device.yaml`.
- GPIO21/22 e GPIO25 só existem nos packages da OLED e da buzina, hoje apontados para `display_off.yaml` e `buzzer_off.yaml`.
- O `device.yaml` declara `board: esp32dev`; “DOIT DevKit V1, 30 pinos” é a placa em uso, não um texto do arquivo.
- VDD do DS18B20 no 5 V (com pull-up no 3V3) é decisão de ligação pedida pelo Anderson, não uma linha do repositório.
- Fusível e chave estão marcados **a instalar**.

Nada foi comprado e não houve commit.
