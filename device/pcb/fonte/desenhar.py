#!/usr/bin/env python3
"""Desenha as saídas (PDF vetorial + PNG 600 dpi) a partir de layout.py / geom.py.

Escala 1:1 garantida: a figura tem o tamanho exato de uma folha A4 e os eixos
são em milímetros de papel (1 unidade = 1 mm)."""
import pathlib
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.path import Path as MPath
from matplotlib.patches import PathPatch, Rectangle, Circle, FancyBboxPatch
from shapely.geometry import Polygon, MultiPolygon
import layout as L
from geom import copper_union, all_pads

OUT = pathlib.Path(__file__).resolve().parent.parent
W, H = L.BOARD_W, L.BOARD_H
PT = 72 / 25.4          # pontos por mm
plt.rcParams["font.family"] = "DejaVu Sans"


class Sheet:
    def __init__(self, w_mm, h_mm):
        self.fig = plt.figure(figsize=(w_mm / 25.4, h_mm / 25.4))
        self.ax = self.fig.add_axes([0, 0, 1, 1])
        self.ax.set_xlim(0, w_mm); self.ax.set_ylim(h_mm, 0)
        self.ax.set_aspect("equal"); self.ax.axis("off")

    def save(self, name, dpi=600, png=True):
        self.fig.savefig(OUT / f"{name}.pdf")
        if png:
            self.fig.savefig(OUT / f"{name}.png", dpi=dpi)
        plt.close(self.fig)

    def text(self, x, y, s, h_mm, **kw):
        kw.setdefault("ha", "left"); kw.setdefault("va", "baseline")
        self.ax.text(x, y, s, fontsize=h_mm * PT, **kw)


class View:
    """Placa desenhada na folha em (ox, oy), escala s, opcionalmente espelhada (vista do lado do cobre)."""

    def __init__(self, sheet, ox, oy, s=1.0, mirror=False):
        self.sh, self.ax, self.ox, self.oy, self.s, self.m = sheet, sheet.ax, ox, oy, s, mirror

    def P(self, x, y):
        return (self.ox + self.s * ((W - x) if self.m else x), self.oy + self.s * y)

    def poly(self, geom, **kw):
        geoms = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
        for g in geoms:
            if g.is_empty:
                continue
            verts, codes = [], []
            for ring in [g.exterior, *g.interiors]:
                pts = [self.P(*c) for c in ring.coords]
                verts += pts
                codes += [MPath.MOVETO] + [MPath.LINETO] * (len(pts) - 2) + [MPath.CLOSEPOLY]
            self.ax.add_patch(PathPatch(MPath(verts, codes), **kw))

    def rect(self, x0, y0, x1, y1, **kw):
        a, b = self.P(x0, y0), self.P(x1, y1)
        self.ax.add_patch(Rectangle((min(a[0], b[0]), min(a[1], b[1])), abs(b[0] - a[0]), abs(b[1] - a[1]), **kw))

    def circle(self, x, y, r, **kw):
        self.ax.add_patch(Circle(self.P(x, y), r * self.s, **kw))

    def line(self, pts, w_mm, **kw):
        xy = np.array([self.P(*p) for p in pts])
        self.ax.plot(xy[:, 0], xy[:, 1], lw=w_mm * self.s * PT, solid_capstyle="round", **kw)

    def text(self, x, y, s, h_mm, **kw):
        kw.setdefault("ha", "center"); kw.setdefault("va", "center")
        X, Y = self.P(x, y)
        self.ax.text(X, Y, s, fontsize=h_mm * self.s * PT, **kw)

    def frame(self, t=0.3):
        """Moldura FORA da placa (linha de corte): borda interna da linha = borda da placa."""
        k = dict(color="black", lw=0)
        self.rect(-t, -t, W + t, 0, **k); self.rect(-t, H, W + t, H + t, **k)
        self.rect(-t, 0, 0, H, **k); self.rect(W, 0, W + t, H, **k)
        for (cx, cy, dx, dy) in [(0, 0, -1, -1), (W, 0, 1, -1), (0, H, -1, 1), (W, H, 1, 1)]:
            self.line([(cx + dx * 1.5, cy), (cx + dx * 5, cy)], 0.2, color="black")
            self.line([(cx, cy + dy * 1.5), (cx, cy + dy * 5)], 0.2, color="black")


def ruler(sheet, x, y, length=50):
    ax = sheet.ax
    ax.add_patch(Rectangle((x, y), length, 0.25, color="black", lw=0))
    for i in range(length + 1):
        h = 4 if i % 10 == 0 else (2.5 if i % 5 == 0 else 1.5)
        ax.add_patch(Rectangle((x + i - 0.1, y), 0.2, h, color="black", lw=0))
        if i % 10 == 0:
            sheet.text(x + i, y + 7, f"{i}", 2.2, ha="center")
    sheet.text(x + length + 2, y + 3, "mm", 2.5)
    # barra de 10 mm bem visível
    ax.add_patch(Rectangle((x, y - 6), 10, 3, color="black", lw=0))
    sheet.text(x + 12, y - 3.6, "= 10 mm (meça com régua; se não der 10 mm, a impressão saiu fora de escala)", 2.4)


def draw_copper(v, holes=True):
    cu = copper_union()
    v.poly(cu, facecolor="black", edgecolor="none")
    if holes:  # ponto branco de centro de furo (guia da broca)
        for (ref, num, x, y, *_r) in all_pads():
            v.circle(x, y, 0.3, color="white", lw=0)


# ------------------------------------------------------------- (1) e (2) cobre
def copper_sheet(name, mirror, title, note):
    sh = Sheet(210, 297)
    sh.text(15, 18, title, 5, weight="bold")
    sh.text(15, 25, "Termômetro Austral · face simples 70 x 50 mm · imprimir em 100% (tamanho real), "
                    "sem \"ajustar à página\"", 2.8)
    sh.text(15, 30, note, 2.8)
    for oy in (45, 125):
        v = View(sh, 70, oy, 1.0, mirror)
        draw_copper(v)
        v.frame()
        sh.text(70, oy - 4, "70 mm", 2.4)
        sh.text(70 + W + 3, oy + H / 2, "50 mm", 2.4, rotation=90, va="center")
    ruler(sh, 70, 205)
    sh.text(15, 228, "Moldura preta = linha de corte (fica fora da placa). Pontos brancos = centro dos furos.", 2.8)
    sh.text(15, 234, "Duas cópias iguais: se a primeira transferência falhar, use a segunda.", 2.8)
    sh.save(name)


copper_sheet("1_cobre_TRANSFERENCIA_espelhado", False,
             "COBRE — PARA TRANSFERÊNCIA (espelhado)",
             "Esta é a folha para passar a ferro. O texto AUSTRAL sai AO CONTRÁRIO aqui: está certo — "
             "na placa pronta ele lê normal.")
copper_sheet("2_cobre_nao_espelhado_vista_do_cobre", True,
             "COBRE — NÃO espelhado (como a placa pronta fica vista pelo lado do cobre)",
             "Só para conferência depois da corrosão. NÃO use esta folha para transferir.")


# ------------------------------------------------------------- (3) montagem
NET_COL = {"GND": "#2b2b2b", "+5V": "#c0392b", "VBAT": "#8e44ad", "+3V3": "#d35400",
           "DQ": "#b7950b", "TRIG": "#1f618d", "ECHO": "#117864", "ECHO5V": "#16a085", "REED": "#6c3483"}


def draw_assembly(v, copper_alpha=0.30, labels=True, colored=False):
    s = v.s
    v.rect(0, 0, W, H, facecolor="#e8d3a9", edgecolor="black", lw=0.6)
    # cobre visto "através" (fica embaixo)
    if colored:
        for net, wdt, pts in L.TRACKS:
            v.line(pts, wdt, color=NET_COL[net], alpha=0.55)
    else:
        v.poly(copper_union(), facecolor="#b8732e", edgecolor="none", alpha=copper_alpha)
    k = dict(fill=False, edgecolor="black", lw=0.5)
    # ESP32: contorno aproximado + barras fêmea
    x0, y0, x1, y1 = L.ESP_OUTLINE
    v.rect(x0, y0, x1, y1, fill=False, edgecolor="#1a5276", lw=0.6, ls="--")
    for yy in (L.ESP_TOP_Y, L.ESP_BOT_Y):
        v.rect(L.esp_x(15) - 1.27, yy - 1.27, L.esp_x(1) + 1.27, yy + 1.27, **k)
    v.rect(x1 - 13.0, y0 + 1.5, x1 - 0.8, y1 - 1.5, fill=False, edgecolor="#1a5276", lw=0.4, ls=":")
    if labels:
        v.text(43.0, 32.3, "U1  ESP32 DevKit V1", 1.25, color="#1a5276", weight="bold")
        v.text(43.0, 34.6, "DOIT 30 pinos, face p/ cima,\nem 2 barras fêmea 1x15", 0.85, color="#1a5276")
        v.text(50.0, 46.4, "antena: nada alto aqui", 0.8, color="#1a5276")
        v.text(x0 + 0.6, 34.7, "USB", 1.1, color="#1a5276", rotation=90)
    # pads
    for (ref, num, x, y, net, shape, w, h, drill, label) in all_pads():
        used = bool(net)
        if shape == "oval":
            v.rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, facecolor="#d4a24c" if used else "#e0c79a",
                   edgecolor="#7a5a1e", lw=0.3)
        else:
            v.circle(x, y, w / 2, facecolor="#d4a24c", edgecolor="#7a5a1e", lw=0.3)
        v.circle(x, y, drill / 2, color="white", lw=0)
        if labels and ref == "U1":
            top = y < 30
            v.text(x, y + (-2.15 if top else 2.15), label, 0.62 if not used else 0.72,
                   rotation=90, color="black" if used else "#8a7a5a", weight="bold" if used else "normal",
                   va="bottom" if top else "top")
    # MP1584
    x0, y0, x1, y1 = L.PARTS["U2"]["outline"]
    v.rect(x0, y0, x1, y1, facecolor="#2e6db4", edgecolor="black", lw=0.5, alpha=0.18)
    if labels:
        v.text((x0 + x1) / 2, 6.0, "U2  MP1584EN", 1.5, weight="bold")
        v.text((x0 + x1) / 2, 13.6, "ajuste o trimpot para 5,00 V\nANTES de encaixar a ESP32", 0.95)
        for (num, x, y, net, *_r, label) in L.PARTS["U2"]["pads"]:
            v.text(x + (2.1 if x < 14 else -2.1), y, label, 1.0, weight="bold",
                   color=NET_COL.get(net, "black") if colored else "black")
    # bornes
    for ref in ("J1", "J2", "J3", "J4"):
        p = L.PARTS[ref]
        x0, y0, x1, y1 = p["outline"]
        v.rect(x0, y0, x1, y1, facecolor="#2e8b57", edgecolor="black", lw=0.5, alpha=0.30)
        if not labels:
            continue
        for (num, x, y, net, *_r, label) in p["pads"]:
            if p["kind"] == "tb_up":
                v.text(x, y + 2.9, label, 1.05, weight="bold")
            else:
                cor = {"J2": {"VDD": " (verm.)", "DQ": " (amar.)", "GND": " (preto)"}}.get(ref, {}).get(label, "")
                v.text(x - 3.0, y, label + cor, 0.95, weight="bold", ha="right")
        if p["kind"] == "tb_up":
            v.text((x0 + x1) / 2, y1 + 1.7, "J1  BATERIA 2S (do BMS)", 1.05, weight="bold")
            v.text((x0 + x1) / 2, y1 + 3.3, "fusível 1 A e chave ficam no fio +", 0.9)
            v.text((x0 + x1) / 2, y0 + 0.9, "↑ fio entra por cima ↑", 0.8)
    if labels:
        v.text(69.0, 7.5, "J4 REED MC-38\n(sem polaridade)", 0.85, rotation=90)
        v.text(69.0, 22.5, "J3  HC-SR04", 0.95, rotation=90, weight="bold")
        v.text(69.0, 40.0, "J2  DS18B20 (sonda)", 0.95, rotation=90, weight="bold")
    # resistores
    for ref in ("R1", "R2", "R3"):
        (n1, xa, ya, *_a), (n2, xb, yb, *_b) = L.PARTS[ref]["pads"]
        cx, cy = (xa + xb) / 2, (ya + yb) / 2
        if L.PARTS[ref]["kind"] == "res_h":
            v.line([(xa, ya), (xb, yb)], 0.5, color="#888")
            v.rect(cx - 3.15, cy - 1.25, cx + 3.15, cy + 1.25, facecolor="#f2e3c6", edgecolor="black", lw=0.5)
        else:
            v.line([(xa, ya), (xb, yb)], 0.5, color="#888")
            v.rect(cx - 1.25, cy - 3.15, cx + 1.25, cy + 3.15, facecolor="#f2e3c6", edgecolor="black", lw=0.5)
        if labels:
            rot = 90 if L.PARTS[ref]["kind"] == "res_v" else 0
            v.text(cx, cy, f"{ref} {L.PARTS[ref]['value']}", 0.9, rotation=rot, weight="bold")
    v.frame(0.0) if False else None


def assembly_sheet():
    s = 2.6
    sh = Sheet(297, 210)
    sh.text(12, 14, "MONTAGEM — vista do lado dos componentes (lado SEM cobre)", 5, weight="bold")
    sh.text(12, 21, "Escala 2,6:1 (ampliada para leitura). Cobre desenhado em transparência (fica na outra face). "
                    "Jumpers de fio: NENHUM.", 2.8)
    v = View(sh, 12, 30, s)
    draw_assembly(v)
    # legenda
    lx = 12 + W * s + 8
    items = [
        "U1  ESP32 DevKit V1 DOIT 30p em 2 barras",
        "     fêmea 1x15 (passo 2,54; fileiras 25,4)",
        "U2  MP1584EN — saída 5,00 V",
        "J1  borne 2 vias: BAT− / BAT+",
        "J2  borne 3 vias: VDD / DQ / GND",
        "J3  borne 4 vias: GND / ECHO / TRIG / VCC",
        "J4  borne 2 vias: REED / GND",
        "R1  4,7 kΩ  DQ(GPIO4) → 3V3",
        "R2  1 kΩ    ECHO do sensor → GPIO27",
        "R3  2 kΩ    GPIO27 → GND",
        "",
        "Pinos usados da ESP32 (em negrito):",
        " cima: VIN, GND, D27, D26, D33",
        " baixo: 3V3, D4",
        "",
        "R1, R2 e R3 ficam EMBAIXO da ESP32:",
        "solde-os antes das barras fêmea.",
        "A ESP32 sai do encaixe para",
        "inspecionar.",
        "",
        "Nada alto embaixo da antena.",
    ]
    for i, t in enumerate(items):
        sh.text(lx, 36 + i * 5.2, t, 2.7, family="DejaVu Sans Mono" if t.startswith(("U", "J", "R")) else "DejaVu Sans")
    sh.save("3_montagem_lado_componentes", dpi=300)
    # 1:1 para conferência sobre a placa
    sh = Sheet(210, 297)
    sh.text(15, 18, "MONTAGEM 1:1 — lado dos componentes", 5, weight="bold")
    sh.text(15, 25, "Mesma escala da placa. Imprima em 100% para conferir peças e furos.", 2.8)
    v = View(sh, 70, 45, 1.0)
    draw_assembly(v, labels=False)
    ruler(sh, 70, 115)
    sh.save("3b_montagem_1para1", dpi=600)


assembly_sheet()


# ------------------------------------------------------------- (4) furos
def drill_sheet():
    s = 2.6
    sh = Sheet(297, 210)
    sh.text(12, 14, "MAPA DE FUROS — vista do lado dos componentes", 5, weight="bold")
    sh.text(12, 21, "Escala 2,6:1. Fure DEPOIS da corrosão, pelo lado do cobre, usando os pontos brancos como guia.", 2.8)
    v = View(sh, 12, 30, s)
    v.rect(0, 0, W, H, facecolor="#f4ecd8", edgecolor="black", lw=0.6)
    sym = {0.8: ("o", "#1f618d"), 1.0: ("s", "#c0392b"), 1.2: ("^", "#117864")}
    counts = {}
    for (ref, num, x, y, net, shape, w, h, drill, label) in all_pads():
        counts.setdefault(drill, []).append(ref)
        m, c = sym[drill]
        X, Y = v.P(x, y)
        sh.ax.plot(X, Y, marker=m, ms=drill * s * PT * 1.5, mfc="none", mec=c, mew=1.0)
        sh.ax.plot(X, Y, marker="+", ms=2.5, color=c, mew=0.5)
    for x in range(0, 71, 10):
        v.text(x, -1.6, f"{x}", 1.0)
    for y in range(0, 51, 10):
        v.text(-2.2, y, f"{y}", 1.0)
    lx = 12 + W * s + 8
    sh.text(lx, 40, "Broca   Qtd   Onde", 3.2, weight="bold", family="DejaVu Sans Mono")
    desc = {0.8: "resistores R1, R2, R3", 1.0: "barras fêmea ESP32 (30) + MP1584 (4)",
            1.2: "bornes J1–J4 (11)"}
    yy = 48
    for d in sorted(counts):
        m, c = sym[d]
        sh.ax.plot(lx + 2, yy - 1, marker=m, ms=8, mfc="none", mec=c, mew=1.2)
        sh.text(lx + 6, yy, f"{d:.1f} mm  {len(counts[d]):>3}   {desc[d]}", 2.8, family="DejaVu Sans Mono")
        yy += 11
    sh.text(lx, yy + 4, f"Total: {sum(len(v) for v in counts.values())} furos", 3, weight="bold")
    sh.text(lx, yy + 12, "Coordenadas exatas: fonte/furos.csv", 2.6)
    sh.text(lx, yy + 18, "Arquivo Excellon (para CNC): fonte/kicad/fab/", 2.6)
    sh.save("4_mapa_de_furos", dpi=300)
    with open(OUT / "fonte" / "furos.csv", "w") as f:
        f.write("ref,pino,nome,x_mm,y_mm,broca_mm\n")
        for (ref, num, x, y, net, shape, w, h, drill, label) in all_pads():
            f.write(f"{ref},{num},{label},{x:.2f},{y:.2f},{drill}\n")
    return counts


counts = drill_sheet()


# ------------------------------------------------------------- prévia para o chat
def preview():
    s = 10.0
    sh = Sheet(W * s * 2 + 60, H * s + 70)
    sh.text(15, 22, "Austral — placa face simples 70 x 50 mm (fenolite)", 13, weight="bold")
    sh.text(15, 40, "Esquerda: cobre para transferência (espelhado)   ·   Direita: montagem, lado dos "
                    "componentes, com as trilhas por rede   ·   0 jumpers · DRC KiCad 0 erros", 7.5, color="#333")
    v = View(sh, 15, 55, s)
    v.rect(0, 0, W, H, facecolor="white", edgecolor="#999", lw=1)
    draw_copper(v)
    v2 = View(sh, 45 + W * s, 55, s)
    draw_assembly(v2, colored=True)
    sh.save("previa_chat", dpi=2400 / ((W * s * 2 + 60) / 25.4) , png=True)
    (OUT / "previa_chat.pdf").unlink()


preview()
print("ok", counts.keys())
