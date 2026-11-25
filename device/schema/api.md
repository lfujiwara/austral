# API do servidor

O servidor em `server/` recebe lotes de leituras por HTTP, guarda cada leitura num banco SQLite e mostra os dados por HTTP. São dois listeners separados:

- A ingestão aceita só `POST /ingest`. Em produção, o Cloudflare Tunnel publica esse listener num hostname público com HTTPS.
- A página e a API de leitura não têm login. Quem controla o acesso é a rede onde esse listener escuta, a tailnet em produção.

## Ingestão

### `POST /ingest`

O dispositivo junta as leituras na memória e manda um lote a cada 5 segundos.

```
POST /ingest
Authorization: Bearer <token do dispositivo>
Content-Type: application/json

{
  "device": "austral-device",
  "boot": 3141592653,
  "seq": 42,
  "entries": [
    { "id": "sensor/product_temperature", "age": 4210, "value": "-18.4" },
    { "id": "sensor/door_distance", "age": 980, "value": "nan" },
    { "id": "binary_sensor/door_open", "age": 120, "value": "OFF" }
  ]
}
```

- `device`: id do dispositivo. O token precisa pertencer a esse id.
- `boot`: inteiro aleatório de 32 bits sorteado a cada boot.
- `seq`: contador do lote, começa em 0 a cada boot e sobe 1 a cada lote enviado com sucesso. Um lote que falhou é reenviado com o mesmo `seq`.
- `entries`: de 0 a 512 itens, na ordem em que os valores mudaram. Um lote vazio só confirma que o dispositivo está ligado.
  - `id`: `<componente>/<entidade>`, como em `entities.json` sem o `/state` final.
  - `age`: milissegundos entre a medição e o envio do lote, inteiro de 0 a 86 400 000.
  - `value`: o valor como texto, no mesmo formato do padrão em `entities.json`. `nan` indica sensor sem resposta.

Regras do servidor:

- O horário de cada leitura é `t = horário de chegada do lote - age`, em milissegundos desde 1970 (UTC). O dispositivo não precisa de relógio.
- Um lote com o mesmo `device`, `boot` e `seq` do último lote aceito é respondido com `204` e não grava nada. Isso torna o reenvio seguro.
- Cada item cujo `value` não bate com o padrão do `id` em `entities.json`, ou cujo `id` não está lá, é descartado e somado em `rejected` do dispositivo. Os outros itens do lote são gravados.
- Cada `sensor/<sensor>` vira uma leitura. `nan` vira `null`.
- Cada outro `id`, como `binary_sensor/door_open`, atualiza o último valor daquela entidade, sem histórico.
- Os ids de dispositivo, de sensor e de entidade seguem `^[a-z0-9_-]{1,64}$`. O servidor descarta qualquer outro e nunca devolve outro id.

Respostas: `204` lote aceito, `400` JSON ou campos fora da regra, `401` token ausente ou de outro dispositivo, `413` corpo acima de 64 KiB.

### Status do dispositivo

O status não vem do dispositivo. O servidor deriva:

- `online` enquanto o último lote aceito tem menos de `AUSTRAL_OFFLINE_AFTER_MS`.
- `offline` depois disso.
- `null` para um dispositivo que nunca mandou lote.

Cada mudança de status sai no stream como evento `status`.

## Configuração

| Variável | Padrão | Uso |
| --- | --- | --- |
| `AUSTRAL_DB_PATH` | obrigatória | arquivo SQLite |
| `AUSTRAL_DEVICE_TOKENS` | obrigatória | pares `<dispositivo>:<token>`, separados por vírgula |
| `AUSTRAL_INGEST_HOST` | `127.0.0.1` | endereço da ingestão |
| `AUSTRAL_INGEST_PORT` | `8081` | porta da ingestão |
| `AUSTRAL_HTTP_HOST` | `127.0.0.1` | endereço da página e da API |
| `AUSTRAL_HTTP_PORT` | `8080` | porta da página e da API |
| `AUSTRAL_HTTP_ALLOWED_HOSTS` | `127.0.0.1:<porta>,localhost:<porta>` | valores aceitos no cabeçalho `Host` da página e da API, separados por vírgula |
| `AUSTRAL_OFFLINE_AFTER_MS` | `15000` | tempo sem lote até o dispositivo contar como offline |

## Endpoints

Todas as respostas são JSON em UTF-8, exceto o stream.

### `GET /api/devices`

Lista os dispositivos que já mandaram alguma mensagem.

```json
[
  {
    "id": "austral-device",
    "status": "online",
    "lastSeen": 1795000000000,
    "rejected": 0,
    "sensors": [
      { "id": "product_temperature", "unit": "°C", "last": { "t": 1795000000000, "v": -18.4 } }
    ],
    "states": {
      "binary_sensor/door_open": { "t": 1795000000000, "value": "OFF" },
      "number/door_closed_distance": { "t": 1795000000000, "value": "0.420" }
    }
  }
]
```

- `status` segue a regra de "Status do dispositivo".
- `lastSeen` é o horário de chegada do último lote aceito.
- `rejected` conta os itens descartados desde que o dispositivo apareceu.
- `sensors` traz os sensores com pelo menos uma leitura, em ordem alfabética de `id`. `unit` vem de `entities.json`, ou é `null`.
- `states` traz o último payload bruto de cada entidade que não é `sensor`, com a chave `<componente>/<entidade>`.

### `GET /api/series`

Parâmetros:

| Nome | Obrigatório | Padrão | Regra |
| --- | --- | --- | --- |
| `device` | sim | | id do dispositivo |
| `sensor` | sim | | id do sensor, como `product_temperature` |
| `from` | não | `to` menos 1 hora | ms |
| `to` | não | agora | ms, maior que `from` |
| `points` | não | `1000` | inteiro de 1 a 2000 |

```json
{
  "device": "austral-device",
  "sensor": "product_temperature",
  "unit": "°C",
  "from": 1794996400000,
  "to": 1795000000000,
  "bucketMs": 3600,
  "points": [[1794996400000, -18.4], [1794996403600, null]]
}
```

- O servidor divide `[from, to)` em baldes de `bucketMs = ceil((to - from) / points)` milissegundos.
- Cada ponto é `[início do balde, média das leituras não nulas]`. Um balde só com `null` dá `null`. Um balde sem leituras não aparece.
- Os pontos vêm em ordem crescente de tempo.
- Parâmetro faltando ou fora da regra: `400` com `{ "error": "<motivo>" }`.
- Dispositivo ou sensor sem nenhuma leitura: `200` com `points` vazio e `unit` de `entities.json`, ou `null`.

### `GET /api/stream`

Server-Sent Events. Cada leitura, cada estado e cada mudança de status saem assim que o lote chega ou o status muda. A conexão não reenvia o histórico.

```
event: reading
data: {"device":"austral-device","sensor":"product_temperature","t":1795000000000,"v":-18.4}

event: status
data: {"device":"austral-device","status":"offline","t":1795000000000}

event: state
data: {"device":"austral-device","id":"binary_sensor/door_open","t":1795000000000,"value":"ON"}
```

O servidor manda um comentário `: ping` a cada 15 segundos para manter a conexão aberta.
