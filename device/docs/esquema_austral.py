#!/usr/bin/env python3
"""Esquema elétrico do termômetro Austral (branch anderson)."""

from pathlib import Path
import math
import schemdraw
from schemdraw import elements as elm
from schemdraw.segments import SegmentArc

OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)

BLK, GRAY, HL, INSTALL, NAVY = "#111111", "#6B7280", "#C2410C", "#9F1239", "#1E3A5F"
PUR = "#5B21B6"
HOP_R = 0.28

d = schemdraw.Drawing(show=False)
d.config(
    fontsize=10, font="DejaVu Sans", mathfont="dejavusans",
    lw=1.25, color=BLK, inches_per_unit=0.36, unit=2.2,
    bgcolor="white", margin=0.55,
)

# Registro para verificação automática
BOXES = []          # (nome, xmin, ymin, xmax, ymax) — só o corpo, sem os pinos
SEGS = []           # (net, x1, y1, x2, y2)
HOPS = []           # (net, cx, cy) — centro do arco, fio que salta
ARCS = []           # (net, cx, cy, r) — para checar arco vs caixa


def lab(xy, text, **kw):
    kw.setdefault("fontsize", 10)
    kw.setdefault("halign", "center")
    kw.setdefault("valign", "center")
    d.add(elm.Label().at(xy).label(text, **kw))


def dot(xy, **kw):
    return d.add(elm.Dot().at(xy), **kw)


def ic_box(name, el, w, h):
    xy = el.absanchors["xy"]
    BOXES.append((name, float(xy[0]), float(xy[1]), float(xy[0] + w), float(xy[1] + h)))


def rec_line(net, a, b):
    SEGS.append((net, float(a[0]), float(a[1]), float(b[0]), float(b[1])))


def line(net, a, b, **kw):
    rec_line(net, a, b)
    el = elm.Line().at(a).to(b)
    if "color" in kw:
        el.color(kw["color"])
    if "linewidth" in kw:
        el.linewidth(kw["linewidth"])
    elif "lw" in kw:
        el.linewidth(kw["lw"])
    return d.add(el)


class HopH(elm.Element):
    """Arco semicircular num fio horizontal. Origem = ponta esquerda. Abaule para cima."""

    def __init__(self, r=HOP_R, **kw):
        super().__init__(**kw)
        color = kw.get("color")
        lw = kw.get("lw") or kw.get("linewidth")
        self.segments.append(SegmentArc((r, 0), width=2 * r, height=2 * r, theta1=0, theta2=180, color=color, lw=lw))
        self.anchors["start"] = (0, 0)
        self.anchors["end"] = (2 * r, 0)


class HopV(elm.Element):
    """Arco semicircular num fio vertical (descendo). Origem = ponta de cima. Abaule para a direita."""

    def __init__(self, r=HOP_R, **kw):
        super().__init__(**kw)
        color = kw.get("color")
        lw = kw.get("lw") or kw.get("linewidth")
        self.segments.append(SegmentArc((0, -r), width=2 * r, height=2 * r, theta1=-90, theta2=90, color=color, lw=lw))
        self.anchors["start"] = (0, 0)
        self.anchors["end"] = (0, -2 * r)


def hop_hline(net, start, end, hop_xs, r=HOP_R, **kw):
    """Fio horizontal com salto semicircular por cima de cada x em hop_xs."""
    x0, y = float(start[0]), float(start[1])
    x1 = float(end[0])
    going_right = x1 >= x0
    lo, hi = min(x0, x1), max(x0, x1)
    hops = sorted(hx for hx in hop_xs if lo + r * 1.05 < hx < hi - r * 1.05)
    if not going_right:
        hops = list(reversed(hops))
    sign = 1 if going_right else -1
    cx = x0
    for hx in hops:
        line(net, (cx, y), (hx - sign * r, y), **kw)
        d.add(HopH(r=r, **{k: v for k, v in kw.items() if k in ('color', 'lw', 'linewidth')}).at((hx - r, y)))
        HOPS.append((net, hx, y))
        ARCS.append((net, hx, y + r * 0.5, r))  # aproximação do lóbulo, só p/ caixa
        cx = hx + sign * r
    line(net, (cx, y), (x1, y), **kw)


def hop_vline(net, start, end, hop_ys, r=HOP_R, **kw):
    """Fio vertical com salto semicircular (à direita) em cada y em hop_ys."""
    x, y0 = float(start[0]), float(start[1])
    y1 = float(end[1])
    going_down = y0 >= y1
    lo, hi = min(y0, y1), max(y0, y1)
    hops = sorted((hy for hy in hop_ys if lo + r * 1.05 < hy < hi - r * 1.05), reverse=going_down)
    sign = -1 if going_down else 1  # deslocamento do y ao atravessar o arco
    cy = y0
    for hy in hops:
        line(net, (x, cy), (x, hy - sign * r), **kw)
        top = hy + r
        d.add(HopV(r=r, **{k: v for k, v in kw.items() if k in ('color', 'lw', 'linewidth')}).at((x, top)))
        HOPS.append((net, x, hy))
        ARCS.append((net, x + r * 0.5, hy, r))
        cy = hy + sign * r
    line(net, (x, cy), (x, y1), **kw)


# Título
lab((15.0, 23.15), "Austral — circuito (branch anderson)", fontsize=16, color=NAVY)
lab(
    (15.0, 22.45),
    "Esquema elétrico  ·  GPIO conferidos em device/firmware/device.yaml  ·  ESP32 DevKit V1 (DOIT, 30 pinos)",
    fontsize=8.5, color=GRAY,
)

# Barramentos
Y5, YG, Y33 = 16.35, 0.70, 14.65
XBUS0, XBUS1 = 0.25, 31.0
YP = 19.25
XG_RIGHT = 28.40  # descida comum de GND, à direita das caixas

line("5V", (XBUS0, Y5), (XBUS1, Y5)).linewidth(2.0)
d.add(elm.Vdd().at((XBUS1, Y5)).label("5 V", fontsize=11, loc="top"))

line("GND", (XBUS0, YG), (XBUS1, YG)).linewidth(2.0)
d.add(elm.Ground().at((2.2, YG)))
d.add(elm.Ground().at((15.0, YG)))
d.add(elm.Ground().at((XG_RIGHT, YG)))
lab((4.0, YG - 0.42), "GND comum", fontsize=9, color=GRAY, halign="left")

# Alimentação
bat = d.add(elm.BatteryDouble().at((0.5, YP)).right())
lab(((bat.start[0] + bat.end[0]) / 2, YP + 1.15), "2× 18650 Alfacell\nem série (2S)", fontsize=9)

BMS_W, BMS_H = 3.0, 2.4
bms = d.add(
    elm.Ic(
        size=(BMS_W, BMS_H),
        pins=[
            elm.IcPin(name="B+", side="left", slot="2/2"),
            elm.IcPin(name="B−", side="left", slot="1/2"),
            elm.IcPin(name="P+", side="right", slot="2/2"),
            elm.IcPin(name="P−", side="right", slot="1/2"),
        ],
    ).at((bat.end[0] + 1.05, YP - 1.70)).theta(0)
)
lab(bms.absanchors["center"], "BMS 2S", fontsize=11)
ic_box("BMS 2S", bms, BMS_W, BMS_H)

line("BAT+", bat.end, (bms.absanchors["B+"][0], bat.end[1]))
line("BAT+", (bms.absanchors["B+"][0], bat.end[1]), bms.absanchors["B+"])
line("BAT−", bat.start, (bat.start[0], bms.absanchors["B−"][1]))
line("BAT−", (bat.start[0], bms.absanchors["B−"][1]), bms.absanchors["B−"])

fuse = d.add(
    elm.Fuse()
    .at((bms.absanchors["P+"][0] + 0.40, YP))
    .right()
    .label("F1  1 A retardado", loc="top", fontsize=9, color=INSTALL)
    .label("(a instalar)", loc="bottom", fontsize=8.5, color=INSTALL)
)
line("PWR+", bms.absanchors["P+"], (fuse.start[0], bms.absanchors["P+"][1]))
line("PWR+", (fuse.start[0], bms.absanchors["P+"][1]), fuse.start)

sw = d.add(
    elm.Switch()
    .at((fuse.end[0] + 0.40, YP))
    .right()
    .label("S1  SPST", loc="top", fontsize=9, color=INSTALL)
    .label("(a instalar)", loc="bottom", fontsize=8.5, color=INSTALL)
)
line("PWR+", fuse.end, sw.start)

MP_W, MP_H = 4.7, 2.7
mp = d.add(
    elm.Ic(
        size=(MP_W, MP_H),
        pins=[
            elm.IcPin(name="IN+", side="left", slot="2/2"),
            elm.IcPin(name="IN−", side="left", slot="1/2"),
            elm.IcPin(name="OUT+", side="right", slot="2/2"),
            elm.IcPin(name="OUT−", side="right", slot="1/2"),
        ],
    ).at((sw.end[0] + 1.15, YP - 1.85)).theta(0)
)
c = mp.absanchors["center"]
lab((c[0], c[1] + 0.35), "MP1584EN", fontsize=11)
lab((c[0], c[1] - 0.15), "módulo buck, trimpot em 5,00 V", fontsize=7.5)
lab((c[0], c[1] - 0.55), "(L e diodo no módulo)", fontsize=7, color=GRAY)
ic_box("MP1584EN", mp, MP_W, MP_H)

line("PWR+", sw.end, (mp.absanchors["IN+"][0], sw.end[1]))
line("PWR+", (mp.absanchors["IN+"][0], sw.end[1]), mp.absanchors["IN+"])

pm, im = bms.absanchors["P−"], mp.absanchors["IN−"]
line("GND", pm, (pm[0] + 0.40, pm[1]))
line("GND", (pm[0] + 0.40, pm[1]), (pm[0] + 0.40, im[1]))
line("GND", (pm[0] + 0.40, im[1]), im)

# OUT+ → barramento 5 V (conexão, com ponto)
outp = mp.absanchors["OUT+"]
line("5V", outp, (outp[0] + 0.50, outp[1]))
dot((outp[0] + 0.50, outp[1]))
line("5V", (outp[0] + 0.50, outp[1]), (outp[0] + 0.50, Y5))
dot((outp[0] + 0.50, Y5))

# OUT−: à direita (salta a descida do OUT+/5 V) e desce no GND comum, com salto no barramento 5 V
outm = mp.absanchors["OUT−"]
OUTP_X = outp[0] + 0.50
hop_hline("GND", outm, (XG_RIGHT, outm[1]), hop_xs=[OUTP_X])
hop_vline("GND", (XG_RIGHT, outm[1]), (XG_RIGHT, YG), hop_ys=[Y5])
dot((XG_RIGHT, YG))

# ESP32
ESP_X, ESP_Y, ESP_W, ESP_H = 5.5, 1.55, 6.3, 11.1
esp = d.add(
    elm.Ic(
        size=(ESP_W, ESP_H),
        pins=[
            elm.IcPin(name="VIN", side="left", slot="3/3", pin="5 V"),
            elm.IcPin(name="3V3", side="left", slot="2/3"),
            elm.IcPin(name="GND", side="left", slot="1/3"),
            elm.IcPin(name="GPIO4", side="right", slot="7/7", pin="1-Wire"),
            elm.IcPin(name="GPIO26", side="right", slot="6/7", pin="Trig"),
            elm.IcPin(name="GPIO27", side="right", slot="5/7", pin="Echo"),
            elm.IcPin(name="GPIO33", side="right", slot="4/7", pin="reed"),
            elm.IcPin(name="GPIO25", side="right", slot="3/7", color=GRAY),
            elm.IcPin(name="GPIO21", side="right", slot="2/7", color=GRAY),
            elm.IcPin(name="GPIO22", side="right", slot="1/7", color=GRAY),
        ],
    ).at((ESP_X, ESP_Y)).theta(0)
)
ce = esp.absanchors["center"]
lab((ce[0], ESP_Y + ESP_H - 1.15), "ESP32 DevKit V1", fontsize=11)
lab((ce[0], ESP_Y + ESP_H - 1.60), "DOIT · 30 pinos · ESPHome", fontsize=8, color=GRAY)
ic_box("ESP32 DevKit V1", esp, ESP_W, ESP_H)

vin = esp.absanchors["VIN"]
line("5V", vin, (vin[0] - 0.75, vin[1]))
line("5V", (vin[0] - 0.75, vin[1]), (vin[0] - 0.75, Y5))
dot((vin[0] - 0.75, Y5))
VIN5_X = vin[0] - 0.75

gndp = esp.absanchors["GND"]
line("GND", gndp, (gndp[0] - 0.75, gndp[1]))
line("GND", (gndp[0] - 0.75, gndp[1]), (gndp[0] - 0.75, YG))
dot((gndp[0] - 0.75, YG))

p33 = esp.absanchors["3V3"]
X33 = p33[0] - 1.30
line("3V3", p33, (X33, p33[1]))
dot((X33, p33[1]))
line("3V3", (X33, p33[1]), (X33, Y33))
dot((X33, Y33))
X33_END = 20.0
hop_hline("3V3", (X33, Y33), (X33_END, Y33), hop_xs=[VIN5_X], color=PUR, linewidth=1.6)
d.add(elm.Vdd().at((X33, Y33)).color(PUR).label("3V3", fontsize=10, loc="top", color=PUR))

# DS18B20
DS_W, DS_H = 3.6, 2.9
ds = d.add(
    elm.Ic(
        size=(DS_W, DS_H),
        pins=[
            elm.IcPin(name="VDD", side="top", slot="1/1"),
            elm.IcPin(name="DQ", side="left", slot="1/1"),
            elm.IcPin(name="GND", side="bottom", slot="1/1"),
        ],
    ).at((22.4, 10.15)).theta(0)
)
ic_box("DS18B20", ds, DS_W, DS_H)

dvd = ds.absanchors["VDD"]
line("5V", dvd, (dvd[0], Y5))
dot((dvd[0], Y5))

# HC-SR04 (desenhado antes do GND do DS18B20, para saber onde saltar / contornar)
HS_W, HS_H = 3.6, 3.0
hs = d.add(
    elm.Ic(
        size=(HS_W, HS_H),
        pins=[
            elm.IcPin(name="TRIG", side="left", slot="2/2"),
            elm.IcPin(name="ECHO", side="left", slot="1/2"),
            elm.IcPin(name="VCC", side="right", slot="2/2"),
            elm.IcPin(name="GND", side="right", slot="1/2"),
        ],
    ).at((22.4, 6.15)).theta(0)
)
ic_box("HC-SR04", hs, HS_W, HS_H)

hvc = hs.absanchors["VCC"]
HVC_X = hvc[0] + 0.55
line("5V", hvc, (HVC_X, hvc[1]))
line("5V", (HVC_X, hvc[1]), (HVC_X, Y5))
dot((HVC_X, Y5))

hg = hs.absanchors["GND"]
HG_X = hg[0] + 1.15
line("GND", hg, (HG_X, hg[1]))
line("GND", (HG_X, hg[1]), (HG_X, YG))
dot((HG_X, YG))

# GND do DS18B20: sai do pino, segue à direita (acima da caixa do HC-SR04),
# salta o 5 V do VCC, e desce no GND comum — nunca entra na caixa.
dg = ds.absanchors["GND"]
hop_hline("GND", dg, (XG_RIGHT, dg[1]), hop_xs=[HVC_X])
dot((XG_RIGHT, dg[1]))  # T no descida comum de GND

# Rótulos à direita da descida de GND, longe das caixas e do fio horizontal
lab((XG_RIGHT + 0.85, ds.absanchors["center"][1] + 0.45), "DS18B20", fontsize=11, halign="left")
lab((XG_RIGHT + 0.85, ds.absanchors["center"][1] - 0.05), "sonda (ar)", fontsize=8, color=GRAY, halign="left")
lab(
    (XG_RIGHT + 0.85, ds.absanchors["center"][1] - 1.35),
    "cores comuns, confira\nna sua sonda:\nvermelho = VDD\namarelo = DQ\npreto = GND",
    fontsize=7.5, color=GRAY, halign="left",
)
lab((XG_RIGHT + 0.85, hs.absanchors["center"][1] + 0.25), "HC-SR04", fontsize=11, halign="left")
lab((XG_RIGHT + 0.85, hs.absanchors["center"][1] - 0.25), "ultrassônico (porta)", fontsize=8, color=GRAY, halign="left")

# 1-Wire
gpio4 = esp.absanchors["GPIO4"]
dq = ds.absanchors["DQ"]
XPU = 17.70
line("DQ", gpio4, (XPU, gpio4[1]))
dot((XPU, gpio4[1]))
line("DQ", (XPU, gpio4[1]), (XPU, dq[1]))
line("DQ", (XPU, dq[1]), dq)

pu = d.add(
    elm.ResistorIEEE()
    .at((XPU, gpio4[1]))
    .up()
    .toy(Y33)
    .color(HL)
    .linewidth(2.0)
)
rec_line("3V3", (XPU, gpio4[1]), (XPU, Y33))  # pull-up liga DQ a 3V3; o resistor é o isolamento
# O pull-up é um resistor: as redes 3V3 e DQ se encontram só através dele.
# Não registro como curto: retiro esse rec_line e trato o resistor como componente.
SEGS.pop()
dot((XPU, Y33)).color(HL)
d.add(
    elm.EncircleBox(
        [pu], padx=0.38, pady=0.16, cornerradius=0.18,
        includelabels=False, color=HL, lw=1.5, ls="--",
    )
)
lab(
    (XPU - 2.35, (gpio4[1] + Y33) / 2),
    "4,7 kΩ pull-up → 3V3\n(nunca 5 V no GPIO)",
    fontsize=8.5, color=HL, halign="right",
)

# TRIG e divisor do ECHO
trig, g26 = hs.absanchors["TRIG"], esp.absanchors["GPIO26"]
line("TRIG", g26, (trig[0], g26[1]))
line("TRIG", (trig[0], g26[1]), trig)

echo, g27 = hs.absanchors["ECHO"], esp.absanchors["GPIO27"]
XJ = 16.55
line("ECHO", echo, (echo[0] - 0.45, echo[1]))
line("ECHO", (echo[0] - 0.45, echo[1]), (echo[0] - 0.45, g27[1]))
r1 = d.add(
    elm.ResistorIEEE()
    .at((echo[0] - 0.45, g27[1]))
    .left()
    .to((XJ, g27[1]))
    .label("1 kΩ", loc="top", fontsize=9)
)
dot((XJ, g27[1]))
line("ECHO", g27, (XJ, g27[1]))
r2 = d.add(
    elm.ResistorIEEE()
    .at((XJ, g27[1]))
    .down()
    .toy(YG + 0.85)
)
d.add(elm.Label().at((XJ + 0.30, (g27[1] + YG + 0.85) / 2)).label("2 kΩ", fontsize=9, halign="left"))
line("GND", r2.end, (XJ, YG))
dot((XJ, YG))

# Reed MC-38
g33 = esp.absanchors["GPIO33"]
XRD = 13.70
line("REED", g33, (XRD, g33[1]))
line("REED", (XRD, g33[1]), (XRD, 2.15))
reed = d.add(
    elm.SwitchReed()
    .at((XRD, 2.15))
    .right()
    .label("MC-38  contato NA", loc="top", fontsize=8.5)
    .label("ímã na porta", loc="bottom", fontsize=7.5, color=GRAY)
)
line("GND", reed.end, (reed.end[0], YG))
dot((reed.end[0], YG))

for name in ("GPIO25", "GPIO21", "GPIO22"):
    d.add(elm.NoConnect().at(esp.absanchors[name]).right().color(GRAY))

# Notas
lab((0.3, -1.15), "Notas", fontsize=10, color=NAVY, halign="left")
notas = (
    "• Nunca ligue o USB e a bateria ao mesmo tempo.",
    "• O pull-up de 4,7 kΩ vai ao 3V3 da ESP32, nunca ao 5 V: o GPIO da ESP32 não tolera 5 V.",
    "• VDD do DS18B20 no 5 V (faixa do datasheet Maxim/Analog Rev 6: VDD 3,0–5,5 V; VIH local ≥ 2,2 V — 3,3 V no DQ está dentro).",
    "• OLED 128×32 (I2C GPIO21/22) e buzina (GPIO25) estão desligadas no firmware (display_off.yaml e buzzer_off.yaml); o código fica guardado.",
    "• Fusível 1 A retardado e chave SPST: a instalar, no positivo, nesta ordem (depois do BMS, antes do IN+ do MP1584).",
    "• O Echo do HC-SR04 sai em 5 V; o divisor 1 kΩ / 2 kΩ entrega cerca de 3,3 V no GPIO27.",
    "• Cruzamento de fios: arco semicircular (salto) — os fios não se ligam. 3V3, 5 V e GND não se encostam.",
)
y = -1.65
for n in notas:
    lab((0.3, y), n, fontsize=8, color=BLK, halign="left")
    y -= 0.48


# -------------------- verificação automática --------------------
POWER = {"5V", "3V3", "GND"}
EPS = 1e-3


def _orient(ax, ay, bx, by, cx, cy):
    v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by)
    if abs(v) < 1e-9:
        return 0
    return 1 if v > 0 else 2


def _on_seg(ax, ay, bx, by, px, py, eps=1e-3):
    return (
        min(ax, bx) - eps <= px <= max(ax, bx) + eps
        and min(ay, by) - eps <= py <= max(ay, by) + eps
        and abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) <= eps * max(1.0, math.hypot(bx - ax, by - ay))
    )


def _seg_intersect(a, b):
    """Ponto de interseção própria (não só ponta compartilhada), ou None."""
    ax, ay, bx, by = a
    cx, cy, dx, dy = b
    o1 = _orient(ax, ay, bx, by, cx, cy)
    o2 = _orient(ax, ay, bx, by, dx, dy)
    o3 = _orient(cx, cy, dx, dy, ax, ay)
    o4 = _orient(cx, cy, dx, dy, bx, by)
    if o1 != o2 and o3 != o4:
        denom = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx)
        if abs(denom) < 1e-12:
            return None
        t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / denom
        px = ax + t * (bx - ax)
        py = ay + t * (by - ay)
        # ignora se cai praticamente num extremo dos dois (T / canto)
        def at_end(x1, y1, x2, y2):
            return math.hypot(px - x1, py - y1) < 0.04 or math.hypot(px - x2, py - y2) < 0.04
        if at_end(ax, ay, bx, by) and at_end(cx, cy, dx, dy):
            return None
        return (px, py)
    return None


def _near_hop(px, py, rad=HOP_R + 0.08):
    return any(math.hypot(px - hx, py - hy) <= rad for _, hx, hy in HOPS)


def _point_in_box(px, py, box, inset=0.04):
    _, xmin, ymin, xmax, ymax = box
    return xmin + inset < px < xmax - inset and ymin + inset < py < ymax - inset


def _seg_enters_box(x1, y1, x2, y2, box, n=25):
    hits = 0
    for i in range(n + 1):
        t = i / n
        if _point_in_box(x1 + t * (x2 - x1), y1 + t * (y2 - y1), box):
            hits += 1
    # permite 0 ou 1 amostra na borda do pino; interior de verdade tem várias
    return hits >= 3


errors = []

# 1) 5 V, 3V3 e GND não se encostam (cruzamento só é lícito no salto)
power_segs = [s for s in SEGS if s[0] in POWER]
for i, a in enumerate(power_segs):
    for b in power_segs[i + 1:]:
        if a[0] == b[0]:
            continue
        pt = _seg_intersect(a[1:], b[1:])
        if pt is not None and not _near_hop(*pt):
            errors.append(
                f"curto ou cruzamento sem salto entre {a[0]} e {b[0]} em ({pt[0]:.2f}, {pt[1]:.2f})"
            )
        # ponta de um net no meio do outro = T de curto
        ax, ay, bx, by = a[1:]
        cx, cy, dx, dy = b[1:]
        for px, py, other in (
            (ax, ay, b), (bx, by, b), (cx, cy, a), (dx, dy, a)
        ):
            ox1, oy1, ox2, oy2 = other[1:]
            if _on_seg(ox1, oy1, ox2, oy2, px, py, eps=0.03):
                # extremo compartilhado de T na mesma junta de alimentação é curto se nets diferem
                mid = not (
                    math.hypot(px - ox1, py - oy1) < 0.05 or math.hypot(px - ox2, py - oy2) < 0.05
                )
                if mid and not _near_hop(px, py):
                    errors.append(
                        f"T-junção entre {a[0]} e {b[0]} em ({px:.2f}, {py:.2f})"
                    )

# 2) nenhum fio atravessa o interior de uma caixa
for net, x1, y1, x2, y2 in SEGS:
    for box in BOXES:
        if _seg_enters_box(x1, y1, x2, y2, box):
            errors.append(f"fio {net} atravessa a caixa {box[0]}")
for net, cx, cy, r in ARCS:
    # amostra o lóbulo
    for k in range(6):
        ang = math.pi * k / 5
        if any(_point_in_box(cx + 0.6 * r * math.cos(ang), cy + 0.6 * r * math.sin(ang), box) for box in BOXES):
            errors.append(f"arco de {net} entra numa caixa")
            break

if errors:
    raise SystemExit("Verificação do esquema falhou:\n  - " + "\n  - ".join(errors))
print("Verificação OK: 3V3/5V/GND sem encosto; nenhum fio dentro de caixa; saltos registrados:", len(HOPS), HOPS)

svg = OUT / "esquema-austral.svg"
png = OUT / "esquema-austral.png"
d.save(str(svg), transparent=False)
d.save(str(png), dpi=200, transparent=False)
print("saved", svg, png)
