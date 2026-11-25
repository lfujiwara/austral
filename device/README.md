# Dispositivo

Firmware do dispositivo Austral e um ambiente de desenvolvimento virtual. O ambiente roda o firmware num ESP32 emulado, com sensores e Wi-Fi simulados, e mostra as leituras num gráfico. Não precisa de placa nem de sensores.

## O que tem aqui

- `firmware/device.yaml`: firmware em ESPHome para ESP32.
- `schema/mqtt.json`: formato de cada tópico MQTT que o dispositivo publica ou aceita.
- `emulator/`: script que compila o QEMU com Wi-Fi para ESP32 e os patches deste repositório.
- `server/`: servidor local. É o broker MQTT com TLS e serve a página com o gráfico.
- `scenarios/`: roteiros que mudam temperaturas e Wi-Fi ao longo do tempo.
- `test/e2e.mjs`: teste de ponta a ponta no emulador.
- `dev`: comando que reúne tudo.

## Firmware

O firmware lê três sensores DS18B20 num barramento 1-Wire no GPIO4: produto, ar e ambiente. Lê a cada 10 segundos, com resolução de 12 bits. O intervalo vai de 5 a 300 segundos e fica salvo na flash.

As leituras saem por MQTT com TLS na porta 8883. A seção "Formato dos dados" descreve os tópicos.

O alarme local liga o buzzer no GPIO25 quando o produto fica acima de -12 °C por 10 minutos. Desliga 1 minuto depois de voltar. Funciona sem Wi-Fi e sem MQTT.

O sensor ultrassônico HC-SR04 mede a distância até a porta. O Trig fica no GPIO26 e o Echo no GPIO27, por um divisor de 1 kΩ e 2 kΩ. O sensor mede a cada 100 ms e o dispositivo publica a mediana de cada segundo, em metros. Sem eco, o valor é `nan`.

Para calibrar, feche a porta e aperte "Calibrate door" na página web do dispositivo, ou envie `PRESS` por MQTT. O dispositivo mede por 3 segundos, calcula a mediana das leituras válidas e grava o resultado em "Door closed distance". Com menos de 5 leituras válidas, mantém o valor antigo e registra um aviso no log. Esse valor também aceita ajuste manual e fica salvo na flash. O valor 0 significa sem calibração.

"Door open" fica `ON` quando a distância passa de "Door closed distance" mais 0,05 m por 2 segundos. Um eco ausente conta como porta aberta. Volta a `OFF` depois de 1 segundo. Sem calibração, ele não publica estado. A margem é a substituição `door_margin` em `firmware/device.yaml`.

O display OLED SSD1306 de 128x32 mostra as temperaturas, o alarme e o estado do Wi-Fi e do MQTT. O endereço do broker pode mudar pelo servidor web do dispositivo ou por MQTT. O novo endereço fica salvo na flash.

Para gravar numa placa real, copie `firmware/example.secrets.yaml` para `firmware/secrets.yaml` e preencha. Os códigos ROM dos sensores aparecem no log do primeiro boot.

## Formato dos dados

O arquivo `schema/mqtt.json` é a referência. Ele lista cada tópico com o padrão do payload, a unidade e a frequência. O servidor confere cada mensagem com esse arquivo. O teste falha se chegar um tópico fora dele ou um payload fora do padrão.

Os tópicos do dispositivo começam com `austral/<dispositivo>/`. O payload é texto puro, sem JSON. Essas mensagens saem com QoS 0 e `retain`. Quem assina recebe na hora o último valor de cada tópico.

| Tópico | Payload | Unidade | Frequência |
| --- | --- | --- | --- |
| `status` | `online` ou `offline` | | na conexão e na queda |
| `sensor/product_temperature/state` | número com uma casa, ou `nan` | °C | 10 s |
| `sensor/air_temperature/state` | número com uma casa, ou `nan` | °C | 10 s |
| `sensor/ambient_temperature/state` | número com uma casa, ou `nan` | °C | 10 s |
| `sensor/door_distance/state` | número com três casas, ou `nan` | m | 1 s |
| `sensor/wifi_signal/state` | inteiro | dBm | 60 s |
| `sensor/uptime/state` | inteiro | s | 60 s |
| `binary_sensor/local_temperature_alarm/state` | `ON` ou `OFF` | | quando muda |
| `binary_sensor/door_open/state` | `ON` ou `OFF` | | quando muda |
| `number/door_closed_distance/state` | número | m | quando muda |
| `switch/buzzer/state` | `ON` ou `OFF` | | quando muda |
| `text/mqtt_broker/state` | endereço do broker | | quando muda |
| `number/read_interval/state` | número | s | quando muda |
| `debug` | linha de log do dispositivo | | a cada log |

`nan` indica um sensor que não respondeu. `binary_sensor/door_open/state` só aparece depois da calibração. O broker publica `offline` em nome do dispositivo quando perde a conexão com ele.

O ESPHome também publica `esphome/discover/<dispositivo>` a cada conexão, com `retain`. O payload é um JSON com os endereços IP, o MAC, a versão do ESPHome e a placa. Esse tópico fica fora do prefixo e o servidor não confere o formato dele.

O dispositivo aceita cinco comandos: `switch/buzzer/command` (`ON`, `OFF` ou `TOGGLE`), `text/mqtt_broker/command` (novo endereço), `number/read_interval/command` (segundos), `button/calibrate_door/command` (`PRESS`) e `number/door_closed_distance/command` (metros).

A página do servidor mostra o último payload bruto de cada tópico e se ele bate com o schema.

## Ambiente virtual

Requisitos: macOS com Homebrew, Node 20.11 ou mais novo, `uv`, `git`, `openssl` e acesso à internet. O setup baixa o QEMU, o ESPHome e as ferramentas de compilação do ESP32.

```sh
cd device
./dev setup   # compila o emulador, instala o ESPHome e o servidor
./dev build   # compila o firmware para o emulador
./dev up      # sobe o servidor e o ESP32 emulado
```

O gráfico abre em http://127.0.0.1:8080. O servidor web do dispositivo emulado abre em http://127.0.0.1:18080. O log serial fica em `.local/run/device.log`. Para parar, rode `./dev down`.

Com o ambiente no ar, os sensores e o Wi-Fi mudam assim:

```sh
./dev temps -10 -15 21        # produto, ar e ambiente em °C
./dev temps -10 -15 unplugged # o sensor de ambiente sai do barramento
./dev wifi off                # o ponto de acesso cai
./dev wifi on
./dev scenario warm-up        # o produto passa de -12 °C e o alarme dispara
```

Os cenários prontos são `warm-up`, `sensor-unplug` e `wifi-drop`.

Para testar uma mudança no firmware, edite `firmware/device.yaml` e rode `./dev ota` com o ambiente no ar. O comando compila e envia o firmware por OTA, como numa placa real. O dispositivo reinicia na versão nova sem perder a flash. `./dev build` grava uma flash nova e só roda com o dispositivo parado.

`./dev test` sobe tudo e confere a conexão, a hora por SNTP, as leituras, o sensor desconectado, a volta depois de uma queda do Wi-Fi, uma atualização por OTA e o schema de todas as mensagens.

## Como o emulador funciona

O QEMU vem do fork [lcgamboa/qemu](https://github.com/lcgamboa/qemu), no commit `64aed503e3`. Esse fork emula o rádio Wi-Fi do ESP32. O emulador cria três redes abertas: `PICSimLabWifi`, `Espressif` e `MasseyWifi`. O firmware do ambiente virtual usa a `PICSimLabWifi`.

Os patches em `emulator/patches` acrescentam duas coisas:

- Sensores DS18B20 no 1-Wire. O modelo lê os pulsos do firmware e responde como os sensores. As temperaturas vêm de `.local/control/temperatures.txt`.
- Um interruptor do Wi-Fi. Com `off` em `.local/control/wifi.txt`, as redes somem e o dispositivo é desconectado.

O QEMU roda com `-icount`. Sem isso, o 1-Wire perde a sincronia.

O build do ambiente virtual inclui `device.yaml` e muda só o nível de log para DEBUG. O firmware é o mesmo da placa.

O servidor e o emulador escutam só em `127.0.0.1`. Certificados, senhas e o firmware compilado ficam em `.local/`, fora do git.

## Licenças

O QEMU e os patches em `emulator/patches` seguem a GPL-2.0. O restante deste diretório segue a licença MIT do repositório.

## Limites

O ambiente virtual não emula o display OLED nem o HC-SR04. Lá, `door_distance` fica em `nan` e a calibração falha por falta de leituras. O sinal do Wi-Fi é sorteado pelo emulador e não reflete distância nem obstáculos. As redes virtuais não têm senha. Ruído elétrico e falhas de alimentação não são simulados. Algumas leituras falham no 1-Wire emulado e chegam como `nan`, com mais frequência logo depois do boot.

## Próximos passos

- P1: simular ruído elétrico nos sensores.
- P2: simular o display OLED.
- P3: variar o sinal do Wi-Fi e usar redes com senha.
