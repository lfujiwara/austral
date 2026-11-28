"""Geometria da placa do termômetro Austral (fonte única).

Coordenadas em mm, VISTA DE CIMA (lado dos componentes), origem no canto
superior esquerdo, y para baixo (igual ao KiCad). O cobre fica na face de
baixo (B.Cu). Placa 70 x 50 mm (paisagem).
"""

BOARD_W, BOARD_H = 70.0, 50.0

# Regras de fabricação caseira (transferência de toner + percloreto)
W_SIG = 1.0     # trilha de sinal
W_PWR = 1.5     # 5 V, bateria, GND
CLEAR = 0.6     # isolamento mínimo entre redes
EDGE = 0.5      # cobre até a borda

# ---------------------------------------------------------------- ESP32
# DOIT ESP32 DevKit V1, 30 pinos, fileiras a 25,4 mm, passo 2,54 mm.
# Montada de face para cima em barras fêmea, antena para a DIREITA, USB à ESQUERDA.
# Coluna esquerda do módulo (EN..VIN) vira a fileira de CIMA; a direita (D23..3V3) a de baixo.
ESP_TOP_Y, ESP_BOT_Y = 22.0, 47.4
ESP_X1 = 42.56          # x do pino 1 (lado da antena); pino k em ESP_X1 - (k-1)*2.54
ESP_TOP = ["EN", "VP", "VN", "D34", "D35", "D32", "D33", "D25", "D26", "D27", "D14", "D12", "D13", "GND", "VIN"]
ESP_BOT = ["D23", "D22", "TX0", "RX0", "D21", "D19", "D18", "D5", "TX2", "RX2", "D4", "D2", "D15", "GND", "3V3"]
ESP_PAD = ("oval", 1.9, 2.6, 1.0)      # forma, largura (x), altura (y), furo
ESP_NETS_TOP = {"VIN": "+5V", "GND": "GND", "D27": "ECHO", "D26": "TRIG", "D33": "REED"}
ESP_NETS_BOT = {"3V3": "+3V3", "D4": "DQ"}
# Contorno aproximado do DevKit (51,8 x 28,2 mm): USB ~2,5 mm além do pino 15, antena ~13,7 mm além do pino 1
ESP_OUTLINE = (ESP_X1 - 14 * 2.54 - 2.5, (ESP_TOP_Y + ESP_BOT_Y) / 2 - 14.1,
               ESP_X1 + 13.74, (ESP_TOP_Y + ESP_BOT_Y) / 2 + 14.1)


def esp_x(k):
    return round(ESP_X1 - (k - 1) * 2.54, 3)


# ---------------------------------------------------------------- Peças
# pad: (nome, x, y, rede, forma, w, h, furo)
R_PAD = ("circle", 2.2, 2.2, 0.8)
MP_PAD = ("circle", 2.2, 2.2, 1.0)
TB_PAD = ("circle", 2.6, 2.6, 1.2)

PARTS = {}


def part(ref, value, pads, outline=None, kind=""):
    PARTS[ref] = dict(ref=ref, value=value, pads=pads, outline=outline, kind=kind)


# U1 ESP32
u1 = []
for k, name in enumerate(ESP_TOP, 1):
    u1.append((f"{k}", esp_x(k), ESP_TOP_Y, ESP_NETS_TOP.get(name), *ESP_PAD, name))
for k, name in enumerate(ESP_BOT, 1):
    u1.append((f"{15 + k}", esp_x(k), ESP_BOT_Y, ESP_NETS_BOT.get(name), *ESP_PAD, name))
part("U1", "ESP32 DevKit V1 (DOIT 30p)", u1, ESP_OUTLINE, "esp32")

# U2 MP1584EN — módulo 22,5 x 17,2 mm, furos nos cantos 18,86 x 13,3 mm
# (footprint público kotakomputer/MP1584EN). Entrada à direita, saída à esquerda, "+" embaixo.
MP_C = (14.0, 10.0)
mpx, mpy = 9.43, 6.65
part("U2", "MP1584EN", [
    ("IN+", MP_C[0] + mpx, MP_C[1] + mpy, "VBAT", *MP_PAD, "IN+"),
    ("IN-", MP_C[0] + mpx, MP_C[1] - mpy, "GND", *MP_PAD, "IN−"),
    ("OUT+", MP_C[0] - mpx, MP_C[1] + mpy, "+5V", *MP_PAD, "OUT+"),
    ("OUT-", MP_C[0] - mpx, MP_C[1] - mpy, "GND", *MP_PAD, "OUT−"),
], (MP_C[0] - 11.25, MP_C[1] - 8.6, MP_C[0] + 11.25, MP_C[1] + 8.6), "mp1584")

# Bornes KF301 passo 5,0 mm. Corpo ~7,5 mm de fundo; entrada do fio virada para a borda.
part("J1", "BAT 2S (do BMS)", [
    ("1", 30.0, 6.5, "GND", *TB_PAD, "BAT−"),
    ("2", 35.0, 6.5, "VBAT", *TB_PAD, "BAT+"),
], (27.5, 6.5 - 3.8, 37.5, 6.5 + 3.7), "tb_up")
TBX = 64.0
part("J4", "REED MC-38", [
    ("1", TBX, 5.0, "REED", *TB_PAD, "REED"),
    ("2", TBX, 10.0, "GND", *TB_PAD, "GND"),
], (TBX - 3.7, 2.5, TBX + 3.8, 12.5), "tb_right")
part("J3", "HC-SR04", [
    ("4", TBX, 15.0, "GND", *TB_PAD, "GND"),
    ("3", TBX, 20.0, "ECHO5V", *TB_PAD, "ECHO"),
    ("2", TBX, 25.0, "TRIG", *TB_PAD, "TRIG"),
    ("1", TBX, 30.0, "+5V", *TB_PAD, "VCC"),
], (TBX - 3.7, 12.5, TBX + 3.8, 32.5), "tb_right")
part("J2", "DS18B20", [
    ("1", TBX, 35.0, "+5V", *TB_PAD, "VDD"),
    ("2", TBX, 40.0, "DQ", *TB_PAD, "DQ"),
    ("3", TBX, 45.0, "GND", *TB_PAD, "GND"),
], (TBX - 3.7, 32.5, TBX + 3.8, 47.5), "tb_right")

# Resistores 1/4 W deitados, passo 7,62 mm (ficam embaixo da ESP32, que é encaixável)
part("R1", "4,7 kΩ", [("1", 7.0, 43.3, "+3V3", *R_PAD, ""), ("2", 14.62, 43.3, "DQ", *R_PAD, "")], None, "res_h")
part("R2", "1 kΩ", [("1", 25.0, 26.9, "ECHO5V", *R_PAD, ""), ("2", 25.0, 34.52, "ECHO", *R_PAD, "")], None, "res_v")
part("R3", "2 kΩ", [("1", 28.0, 34.52, "ECHO", *R_PAD, ""), ("2", 35.62, 34.52, "GND", *R_PAD, "")], None, "res_h")

# ---------------------------------------------------------------- Trilhas (face de cobre)
G, P = W_PWR, W_SIG
TRACKS = [
    # GND: barramento pela borda de cima e pela direita, atrás dos bornes
    ("GND", G, [(4.57, 3.35), (4.57, 2.0), (67.0, 2.0), (67.0, 45.0), (64.0, 45.0)]),
    ("GND", G, [(23.43, 3.35), (23.43, 2.0)]),
    ("GND", G, [(30.0, 6.5), (30.0, 2.0)]),
    ("GND", G, [(67.0, 10.0), (64.0, 10.0)]),
    ("GND", G, [(67.0, 15.0), (64.0, 15.0)]),
    ("GND", G, [(9.54, 2.0), (9.54, 22.0)]),
    ("GND", G, [(9.54, 22.0), (9.54, 37.5), (35.62, 37.5), (35.62, 34.52)]),
    # Bateria
    ("VBAT", G, [(35.0, 6.5), (35.0, 16.65), (23.43, 16.65)]),
    # 5 V
    ("+5V", G, [(4.57, 16.65), (7.0, 19.08), (7.0, 22.0)]),
    ("+5V", G, [(7.0, 22.0), (7.0, 40.0), (51.5, 40.0), (51.5, 30.0), (64.0, 30.0)]),
    ("+5V", G, [(51.5, 35.0), (64.0, 35.0)]),
    # 3V3 só até o pull-up
    ("+3V3", P, [(7.0, 47.4), (7.0, 43.3)]),
    # 1-Wire
    ("DQ", P, [(14.62, 43.3), (17.16, 43.3), (17.16, 47.4)]),
    ("DQ", P, [(17.16, 43.3), (54.0, 43.3), (54.0, 40.0), (64.0, 40.0)]),
    # HC-SR04
    ("TRIG", P, [(22.24, 22.0), (22.24, 29.2), (49.0, 29.2), (49.0, 25.0), (64.0, 25.0)]),
    ("ECHO", P, [(19.70, 22.0), (19.70, 34.52), (28.0, 34.52)]),
    ("ECHO5V", P, [(25.0, 26.9), (47.0, 26.9), (47.0, 20.0), (64.0, 20.0)]),
    # Reed
    ("REED", P, [(27.32, 22.0), (27.32, 24.6), (45.0, 24.6), (45.0, 5.0), (64.0, 5.0)]),
]

JUMPERS = []   # nenhum fio jumper foi necessário

# Texto em cobre (lê certo olhando o lado do cobre): confere o espelhamento
COPPER_TEXT = [("AUSTRAL", 16.3, 8.4, 1.8), ("v1 50x70", 16.3, 11.6, 1.4)]

# ---------------------------------------------------------------- Netlist esperada (do esquema)
# Fonte: docs/ligacoes.md e docs/esquema_austral.py (branch anderson)
EXPECTED = {
    "VBAT": {"J1.2", "U2.IN+"},
    "GND": {"J1.1", "U2.IN-", "U2.OUT-", "U1.14", "J2.3", "J3.4", "J4.2", "R3.2"},
    "+5V": {"U2.OUT+", "U1.15", "J2.1", "J3.1"},
    "+3V3": {"U1.30", "R1.1"},
    "DQ": {"J2.2", "R1.2", "U1.26"},
    "TRIG": {"J3.2", "U1.9"},
    "ECHO5V": {"J3.3", "R2.1"},
    "ECHO": {"R2.2", "R3.1", "U1.10"},
    "REED": {"J4.1", "U1.7"},
}
