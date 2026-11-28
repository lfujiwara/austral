#!/usr/bin/env python3
"""Esquema elétrico do termômetro Austral (branch anderson)."""

from pathlib import Path
import schemdraw
from schemdraw import elements as elm

OUT = Path("/workspace/austral/docs")
OUT.mkdir(parents=True, exist_ok=True)

BLK, GRAY, HL, INSTALL, NAVY = "#111111", "#6B7280", "#C2410C", "#9F1239", "#1E3A5F"
PUR = "#5B21B6"

d = schemdraw.Drawing(show=False)
d.config(
    fontsize=10, font="DejaVu Sans", mathfont="dejavusans",
    lw=1.25, color=BLK, inches_per_unit=0.36, unit=2.2,
    bgcolor="white", margin=0.55,
)

def lab(xy, text, **kw):
    kw.setdefault("fontsize", 10)
    kw.setdefault("halign", "center")
    kw.setdefault("valign", "center")
    d.add(elm.Label().at(xy).label(text, **kw))

def dot(xy, **kw):
    return d.add(elm.Dot().at(xy), **kw)


# Título
lab((15.0, 23.15), "Austral — circuito (branch anderson)", fontsize=16, color=NAVY)
lab(
    (15.0, 22.45),
    "Esquema elétrico  ·  GPIO conferidos em device/firmware/device.yaml  ·  ESP32 DevKit V1 (DOIT, 30 pinos)",
    fontsize=8.5, color=GRAY,
)

# Barramentos
Y5, YG, Y33 = 16.35, 0.70, 14.65
XBUS0, XBUS1 = 0.25, 30.2
YP = 19.25

d.add(elm.Line().at((XBUS0, Y5)).to((XBUS1, Y5)).linewidth(2.0))
d.add(elm.Vdd().at((XBUS1, Y5)).label("5 V", fontsize=11, loc="top"))

d.add(elm.Line().at((XBUS0, YG)).to((XBUS1, YG)).linewidth(2.0))
d.add(elm.Ground().at((2.2, YG)))
d.add(elm.Ground().at((15.0, YG)))
d.add(elm.Ground().at((28.2, YG)))
lab((4.0, YG - 0.42), "GND comum", fontsize=9, color=GRAY, halign="left")

# Alimentação
bat = d.add(elm.BatteryDouble().at((0.5, YP)).right())
lab(((bat.start[0] + bat.end[0]) / 2, YP + 1.15), "2× 18650 Alfacell\nem série (2S)", fontsize=9)

bms = d.add(
    elm.Ic(
        size=(3.0, 2.4),
        pins=[
            elm.IcPin(name="B+", side="left", slot="2/2"),
            elm.IcPin(name="B−", side="left", slot="1/2"),
            elm.IcPin(name="P+", side="right", slot="2/2"),
            elm.IcPin(name="P−", side="right", slot="1/2"),
        ],
    ).at((bat.end[0] + 1.05, YP - 1.70)).theta(0)
)
lab(bms.absanchors["center"], "BMS 2S", fontsize=11)

d.add(elm.Line().at(bat.end).tox(bms.absanchors["B+"][0]))
d.add(elm.Line().to(bms.absanchors["B+"]))
d.add(elm.Line().at(bat.start).down().toy(bms.absanchors["B−"][1]))
d.add(elm.Line().to(bms.absanchors["B−"]))

fuse = d.add(
    elm.Fuse()
    .at((bms.absanchors["P+"][0] + 0.40, YP))
    .right()
    .label("F1  1 A retardado", loc="top", fontsize=9, color=INSTALL)
    .label("(a instalar)", loc="bottom", fontsize=8.5, color=INSTALL)
)
d.add(elm.Line().at(bms.absanchors["P+"]).tox(fuse.start[0]))
d.add(elm.Line().to(fuse.start))

sw = d.add(
    elm.Switch()
    .at((fuse.end[0] + 0.40, YP))
    .right()
    .label("S1  SPST", loc="top", fontsize=9, color=INSTALL)
    .label("(a instalar)", loc="bottom", fontsize=8.5, color=INSTALL)
)
d.add(elm.Line().at(fuse.end).to(sw.start))

mp = d.add(
    elm.Ic(
        size=(4.7, 2.7),
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

d.add(elm.Line().at(sw.end).tox(mp.absanchors["IN+"][0]))
d.add(elm.Line().to(mp.absanchors["IN+"]))

pm, im = bms.absanchors["P−"], mp.absanchors["IN−"]
d.add(elm.Line().at(pm).to((pm[0] + 0.40, pm[1])))
d.add(elm.Line().toy(im[1]))
d.add(elm.Line().to(im))

outp = mp.absanchors["OUT+"]
d.add(elm.Line().at(outp).right().length(0.50))
dot((outp[0] + 0.50, outp[1]))
d.add(elm.Line().down().toy(Y5))
dot((outp[0] + 0.50, Y5))

outm = mp.absanchors["OUT−"]
d.add(elm.Line().at(outm).right().length(1.00))
d.add(elm.Line().down().toy(YG))
dot((outm[0] + 1.00, YG))

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
# título no alto do bloco, longe dos pinos 3V3/GPIO33
lab((ce[0], ESP_Y + ESP_H - 1.15), "ESP32 DevKit V1", fontsize=11)
lab((ce[0], ESP_Y + ESP_H - 1.60), "DOIT · 30 pinos · ESPHome", fontsize=8, color=GRAY)

vin = esp.absanchors["VIN"]
d.add(elm.Line().at(vin).left().length(0.75))
d.add(elm.Line().up().toy(Y5))
dot((vin[0] - 0.75, Y5))

gndp = esp.absanchors["GND"]
d.add(elm.Line().at(gndp).left().length(0.75))
d.add(elm.Line().down().toy(YG))
dot((gndp[0] - 0.75, YG))

p33 = esp.absanchors["3V3"]
X33 = p33[0] - 1.30
d.add(elm.Line().at(p33).left().length(1.30))
dot((X33, p33[1]))
d.add(elm.Line().up().toy(Y33))
dot((X33, Y33))
X33_END = 20.0
d.add(elm.Line().at((X33, Y33)).to((X33_END, Y33)).linewidth(1.6).color(PUR))
d.add(elm.Vdd().at((X33, Y33)).color(PUR).label("3V3", fontsize=10, loc="top", color=PUR))

# DS18B20
ds = d.add(
    elm.Ic(
        size=(3.6, 2.9),
        pins=[
            elm.IcPin(name="VDD", side="top", slot="1/1"),
            elm.IcPin(name="DQ", side="left", slot="1/1"),
            elm.IcPin(name="GND", side="bottom", slot="1/1"),
        ],
    ).at((22.4, 10.15)).theta(0)
)
lab((ds.absanchors["GND"][0] + 3.6, ds.absanchors["center"][1] + 0.45), "DS18B20", fontsize=11, halign="left")
lab((ds.absanchors["GND"][0] + 3.6, ds.absanchors["center"][1] - 0.05), "sonda (ar)", fontsize=8, color=GRAY, halign="left")

dvd = ds.absanchors["VDD"]
d.add(elm.Line().at(dvd).up().toy(Y5))
dot((dvd[0], Y5))

dg = ds.absanchors["GND"]
d.add(elm.Line().at(dg).down().length(0.30))
d.add(elm.Line().right().length(1.40))
d.add(elm.Line().down().toy(YG))
dot((dg[0] + 1.40, YG))

gpio4 = esp.absanchors["GPIO4"]
dq = ds.absanchors["DQ"]
XPU = 17.70
d.add(elm.Line().at(gpio4).to((XPU, gpio4[1])))
dot((XPU, gpio4[1]))
d.add(elm.Line().toy(dq[1]))
d.add(elm.Line().to(dq))

pu = d.add(
    elm.ResistorIEEE()
    .at((XPU, gpio4[1]))
    .up()
    .toy(Y33)
    .color(HL)
    .linewidth(2.0)

)
dot((XPU, Y33)).color(HL)
d.add(
    elm.EncircleBox(
        [pu], padx=0.38, pady=0.16, cornerradius=0.18,
        includelabels=False, color=HL, lw=1.5, ls='--',
    )
)
lab(
    (XPU - 2.35, (gpio4[1] + Y33) / 2),
    "4,7 kΩ pull-up → 3V3\n(nunca 5 V no GPIO)",
    fontsize=8.5, color=HL, halign="right",
)
lab(
    (ds.absanchors["GND"][0] + 3.6, ds.absanchors["center"][1] - 1.35),
    "cores comuns, confira\nna sua sonda:\nvermelho = VDD\namarelo = DQ\npreto = GND",
    fontsize=7.5, color=GRAY, halign="left",
)

# HC-SR04
hs = d.add(
    elm.Ic(
        size=(3.6, 3.0),
        pins=[
            elm.IcPin(name="TRIG", side="left", slot="2/2"),
            elm.IcPin(name="ECHO", side="left", slot="1/2"),
            elm.IcPin(name="VCC", side="right", slot="2/2"),
            elm.IcPin(name="GND", side="right", slot="1/2"),
        ],
    ).at((22.4, 6.15)).theta(0)
)
lab((hs.absanchors["center"][0] + 3.45, hs.absanchors["center"][1] + 0.25), "HC-SR04", fontsize=11, halign="left")
lab((hs.absanchors["center"][0] + 3.45, hs.absanchors["center"][1] - 0.25), "ultrassônico (porta)", fontsize=8, color=GRAY, halign="left")

hvc = hs.absanchors["VCC"]
d.add(elm.Line().at(hvc).right().length(0.55))
d.add(elm.Line().up().toy(Y5))
dot((hvc[0] + 0.55, Y5))

hg = hs.absanchors["GND"]
d.add(elm.Line().at(hg).right().length(1.15))
d.add(elm.Line().down().toy(YG))
dot((hg[0] + 1.15, YG))

trig, g26 = hs.absanchors["TRIG"], esp.absanchors["GPIO26"]
d.add(elm.Line().at(g26).tox(trig[0]))
d.add(elm.Line().to(trig))

# Divisor no Echo: ECHO → 1 kΩ → nó (GPIO27) → 2 kΩ → GND.
# O nó é só em (XJ, g27.y). Não pode haver fio nu desse encontro até o terra.
echo, g27 = hs.absanchors["ECHO"], esp.absanchors["GPIO27"]
XJ = 16.55
# Sobe do ECHO até a altura do GPIO27, depois 1 kΩ horizontal até o nó.
d.add(elm.Line().at(echo).left().length(0.45))
d.add(elm.Line().toy(g27[1]))
r1 = d.add(
    elm.ResistorIEEE()
    .at((echo[0] - 0.45, g27[1]))
    .left()
    .to((XJ, g27[1]))
    .label("1 kΩ", loc="top", fontsize=9)
)
dot((XJ, g27[1]))
d.add(elm.Line().at(g27).to((XJ, g27[1])))
# 2 kΩ sai do mesmo nó e só a outra ponta chega ao GND.
r2 = d.add(
    elm.ResistorIEEE()
    .at((XJ, g27[1]))
    .down()
    .toy(YG + 0.85)
    .label("2 kΩ", loc="lft", fontsize=9)
)
d.add(elm.Line().at(r2.end).down().toy(YG))
dot((XJ, YG))

# Reed MC-38 (contato NA) entre GPIO33 e GND
g33 = esp.absanchors["GPIO33"]
XRD = 13.70
d.add(elm.Line().at(g33).to((XRD, g33[1])))
d.add(elm.Line().down().toy(2.15))
reed = d.add(
    elm.SwitchReed()
    .at((XRD, 2.15))
    .right()
    .label("MC-38  contato NA", loc="top", fontsize=8.5)
    .label("ímã na porta", loc="bottom", fontsize=7.5, color=GRAY)
)
d.add(elm.Line().at(reed.end).down().toy(YG))
dot((reed.end[0], YG))

# Pinos desligados no firmware: só o símbolo NC; o texto vai na legenda
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
)
y = -1.65
for n in notas:
    lab((0.3, y), n, fontsize=8, color=BLK, halign="left")
    y -= 0.48

svg = OUT / "esquema-austral.svg"
png = OUT / "esquema-austral.png"
d.save(str(svg), transparent=False)
d.save(str(png), dpi=200, transparent=False)
print("saved", svg, png)
