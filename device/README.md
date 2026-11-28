# Dispositivo

Firmware do dispositivo Austral e um ambiente de desenvolvimento virtual. O ambiente roda o firmware num ESP32 emulado, com sensores e Wi-Fi simulados, e mostra as leituras num gráfico. Não precisa de placa nem de sensores.

Esta branch é a variante offline. A buzina e a tela ficam fora do firmware que a placa roda. As seções "Buzina" e "Tela" explicam como religar.

## O que tem aqui

- `firmware/device.yaml`: firmware em ESPHome para ESP32.
- `firmware/packages/buzzer.yaml`: buzina no GPIO25 e as ações que a ligam no alarme local. A variante offline inclui `packages/buzzer_off.yaml` no lugar dele.
- `firmware/packages/buzzer_off.yaml`: pacote vazio incluído no lugar da buzina.
- `firmware/packages/display.yaml`: tela OLED. A variante offline inclui `packages/display_off.yaml` no lugar dele.
- `firmware/packages/display_off.yaml`: pacote vazio incluído no lugar da tela.
- `schema/mqtt.json`: formato de cada tópico MQTT que o dispositivo publica ou aceita.
- `emulator/`: script que compila o QEMU com Wi-Fi para ESP32 e os patches deste repositório.
- `server/`: servidor local. É o broker MQTT com TLS e serve a página com o gráfico.
- `scenarios/`: roteiros que mudam a temperatura e o Wi-Fi ao longo do tempo.
- `test/e2e.mjs`: teste de ponta a ponta no emulador.
- `dev`: comando que reúne tudo. `./dev lan` prepara o broker TLS na rede de casa.

## Firmware

O firmware lê um DS18B20 no barramento 1-Wire do GPIO4, a sonda de ar. Lê a cada 10 segundos, com resolução de 12 bits. O intervalo vai de 5 a 300 segundos e fica salvo na flash.

O HC-SR04 mede a distância até a porta. O Trig fica no GPIO26 e o Echo no GPIO27, atrás de um divisor de 1 kΩ e 2 kΩ. O sensor mede a cada 100 ms. O dispositivo publica a mediana de cada segundo, em metros. Sem eco, o valor é `nan`.

O estado da porta sai da distância do HC-SR04. Feche a porta e aperte "Calibrate door" na página web do dispositivo, ou publique `PRESS` em `button/calibrate_door/command`. O dispositivo mede por 3 segundos, calcula a mediana das leituras válidas e grava "Door closed distance". Com menos de 5 leituras válidas, mantém o valor antigo e registra um aviso no log. Esse valor também aceita ajuste manual e fica salvo na flash. O valor 0 significa sem calibração.

"Door open" fica `ON` quando a distância passa de "Door closed distance" mais 0,05 m por 2 segundos. Um eco ausente conta como porta aberta. Volta a `OFF` depois de 1 segundo. O estado da porta só é publicado depois da calibração. A margem é a substituição `door_margin` em `firmware/device.yaml`.

As leituras saem por MQTT com TLS na porta 8883. A seção "Formato dos dados" descreve os tópicos.

O alarme local observa a sonda de ar. O limite padrão é 5,0 °C. A entidade "Alarm threshold" guarda esse limite na flash. Dá para mudar pela página web do dispositivo ou por `number/alarm_threshold/command`, de -40 a 40 °C, em passos de 0,1. O alarme publica `ON` quando o ar fica acima do limite por 10 minutos e `OFF` 1 minuto depois de voltar ao limite ou abaixo. Funciona sem Wi-Fi e sem MQTT. Nesta variante o alarme local só publica o estado.

Nesta variante a tela não entra no firmware. O endereço do broker pode mudar pelo servidor web do dispositivo ou por MQTT. O novo endereço fica salvo na flash.

Para gravar numa placa real na rede de casa, siga a seção "Rede de casa no Mac". O código ROM da sonda aparece no log do primeiro boot.

## Buzina

O código da buzina continua no repositório, em `firmware/packages/buzzer.yaml`. Ele define a saída no GPIO25, a chave "Buzzer" e as ações que ligam e desligam essa chave quando o alarme local muda.

`firmware/device.yaml` escolhe o pacote pela substituição `buzzer_package`. A variante offline aponta para `packages/buzzer_off.yaml`. Esse pacote entra vazio: o GPIO25 fica livre e o alarme local fica só no MQTT.

Para reativar a buzina, troque a substituição e grave o firmware de novo:

```yaml
buzzer_package: packages/buzzer.yaml
```

A chave volta a publicar `switch/buzzer/state` (`ON` ou `OFF`) e a aceitar `switch/buzzer/command` (`ON`, `OFF` ou `TOGGLE`). Inclua esses dois tópicos de novo em `schema/mqtt.json` para o servidor e o `./dev test` aceitarem as mensagens. O teste também recusa qualquer tópico com `buzzer` no nome. Tire essa checagem ao religar a buzina.

## Tela

O código da tela continua no repositório, em `firmware/packages/display.yaml`. Ele liga o OLED SSD1306 de 128x32 no I2C, SDA no GPIO21 e SCL no GPIO22, endereço 0x3C. A tela alterna duas páginas a cada 6 segundos: o gráfico do ar nos últimos 30 minutos, com o valor atual e o limite ao lado, e a página com porta, alarme, Wi-Fi e MQTT.

`firmware/device.yaml` escolhe o pacote pela substituição `display_package`. Esta branch aponta para `packages/display_off.yaml`. Esse pacote entra vazio. O I2C não sobe e a tela não é inicializada.

Para religar a tela, troque a substituição e grave o firmware de novo:

```yaml
display_package: packages/display.yaml
```

## Formato dos dados

O arquivo `schema/mqtt.json` é a referência. Ele lista cada tópico com o padrão do payload, a unidade e a frequência. O servidor confere cada mensagem com esse arquivo. O teste falha se chegar um tópico fora dele ou um payload fora do padrão.

Os tópicos do dispositivo começam com `austral/<dispositivo>/`. O payload é texto puro, sem JSON. Essas mensagens saem com QoS 0 e `retain`. Quem assina recebe na hora o último valor de cada tópico.

| Tópico | Payload | Unidade | Frequência |
| --- | --- | --- | --- |
| `status` | `online` ou `offline` | | na conexão e na queda |
| `sensor/air_temperature/state` | número com uma casa, ou `nan` | °C | 10 s |
| `sensor/door_distance/state` | número com três casas, ou `nan` | m | 1 s |
| `sensor/wifi_signal/state` | inteiro | dBm | 60 s |
| `sensor/uptime/state` | inteiro | s | 60 s |
| `binary_sensor/door_open/state` | `ON` ou `OFF` | | quando muda, depois da calibração |
| `binary_sensor/local_temperature_alarm/state` | `ON` ou `OFF` | | quando muda |
| `text/mqtt_broker/state` | endereço do broker | | quando muda |
| `number/read_interval/state` | número | s | quando muda |
| `number/door_closed_distance/state` | número | m | quando muda |
| `number/alarm_threshold/state` | número | °C | quando muda |
| `debug` | linha de log do dispositivo | | a cada log |

`nan` indica um sensor que não respondeu. O broker publica `offline` em nome do dispositivo quando perde a conexão com ele. `binary_sensor/door_open/state` só aparece depois da calibração.

O ESPHome também publica `esphome/discover/<dispositivo>` a cada conexão, com `retain`. O payload é um JSON com os endereços IP, o MAC, a versão do ESPHome e a placa. Esse tópico fica fora do prefixo e o servidor não confere o formato dele.

O dispositivo aceita cinco comandos: `text/mqtt_broker/command` (novo endereço), `number/read_interval/command` (segundos), `number/door_closed_distance/command` (metros), `number/alarm_threshold/command` (°C, de -40 a 40) e `button/calibrate_door/command` (`PRESS`).

A página do servidor mostra o último payload bruto de cada tópico e se ele bate com o schema.

## Rede de casa no Mac

A placa manda as leituras para o broker MQTT deste repositório, com TLS e senha. O modo normal continua só em `127.0.0.1`. A rede de casa entra com `--lan` ou com `AUSTRAL_LAN=1`. Nesse modo a porta 8883 abre na rede, só com TLS. O gráfico fica em `http://127.0.0.1:8080`, neste Mac. Nenhuma porta sem TLS fica na rede.

A placa precisa do Wi-Fi de 2,4 GHz, o mesmo do Mac. Se o Mac estiver em `192.168.0.x`, o comando usa esse endereço. Se o IP mudar, rode `./dev lan prepare` de novo e grave o firmware outra vez. Rodar de novo mantém o mesmo usuário e a mesma senha.

Requisitos: Node 20.11 ou mais novo, Python 3 e `openssl`. O `openssl` já vem no macOS. Não precisa de Docker.

```sh
cd device
./dev lan prepare
```

O comando grava em `firmware/secrets.yaml`, sem mostrar senha:

- `mqtt_broker`: o IP da rede, por exemplo `192.168.0.23`. Use esse IP. O certificado também traz o nome `<hostname>.local`. Só troque `mqtt_broker` por esse nome se quiser que a placa disque o nome em vez do IP.
- `mqtt_username` e `mqtt_password`: gerados em `.local/credentials.env`.
- `mqtt_ca`: o conteúdo de `.local/tls/ca.pem`, a autoridade que assina o broker. O comando cola esse texto no secrets. Não use o certificado do servidor no lugar da autoridade.

`wifi_ssid` e `wifi_password` não são alterados. Se ainda estiverem de exemplo, preencha os dois no mesmo arquivo. Não copie o arquivo para outro lugar.

Grave a placa, ligada por USB:

```sh
cd device
python3 -m venv .local/venv
.local/venv/bin/pip install 'esphome==2026.9.1'
cd firmware
../.local/venv/bin/esphome run device.yaml
```

Suba o broker. O gráfico abre só neste Mac.

```sh
cd device
./dev server --lan
```

Para subir também o ESP32 emulado, use `./dev up --lan` ou `AUSTRAL_LAN=1 ./dev up`. Sem `--lan` e sem a variável, tudo continua em `127.0.0.1`.

Se o firewall do macOS estiver ligado, ele pode perguntar se o Node pode aceitar conexões de entrada. Permita. Se a pergunta não aparecer: Ajustes do Sistema, Rede, Firewall, Opções, e permita o Node. A única porta na rede é a 8883, com TLS e senha.

## Ambiente virtual

Requisitos: macOS com Homebrew, Node 20.11 ou mais novo, `uv`, `git`, `openssl` e acesso à internet. O setup baixa o QEMU, o ESPHome e as ferramentas de compilação do ESP32.

```sh
cd device
./dev setup   # compila o emulador, instala o ESPHome e o servidor
./dev build   # compila o firmware para o emulador
./dev up      # sobe o servidor e o ESP32 emulado
```

O gráfico abre em http://127.0.0.1:8080. O servidor web do dispositivo emulado abre em http://127.0.0.1:18080. O log serial fica em `.local/run/device.log`. Para parar, rode `./dev down`.

Com o ambiente no ar, a sonda e o Wi-Fi mudam assim:

```sh
./dev temps -21.25        # ar em °C
./dev temps unplugged     # a sonda de ar sai do barramento
./dev wifi off            # o ponto de acesso cai
./dev wifi on
./dev scenario warm-up    # o ar passa de 5 °C e o alarme local muda; a buzina continua desligada
```

Os cenários prontos são `warm-up`, `sensor-unplug` e `wifi-drop`.

Para testar uma mudança no firmware, edite `firmware/device.yaml` e rode `./dev ota` com o ambiente no ar. O comando compila e envia o firmware por OTA, como numa placa real. O dispositivo reinicia na versão nova sem perder a flash. `./dev build` grava uma flash nova e só roda com o dispositivo parado.

`./dev test` sobe tudo e confere a conexão, a hora por SNTP, as leituras, a sonda desconectada, a volta depois de uma queda do Wi-Fi, uma atualização por OTA, o schema de todas as mensagens, o limite padrão de 5 °C e a ausência da buzina.

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

O ambiente virtual não emula o display OLED nem o HC-SR04. No emulador, `door_distance` fica em `nan` e a calibração falha por falta de leituras. O estado da porta não é publicado. O sinal do Wi-Fi é sorteado pelo emulador e não reflete distância nem obstáculos. As redes virtuais não têm senha. Ruído elétrico e falhas de alimentação não são simulados. Algumas leituras falham no 1-Wire emulado e chegam como `nan`, com mais frequência logo depois do boot.

## Próximos passos

- P1: simular ruído elétrico nos sensores.
- P2: simular o display OLED.
- P3: variar o sinal do Wi-Fi e usar redes com senha.
