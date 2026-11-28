#!/usr/bin/env python3
"""Checagem programática independente do KiCad: netlist, conectividade por rede,
isolamento entre redes, distância à borda, anel dos furos, larguras de trilha."""
import itertools, sys
from collections import defaultdict
from shapely.ops import unary_union
import layout as L
from geom import copper_items, all_pads, board_poly

ok = True
lines = []


def rep(flag, msg):
    global ok
    ok &= flag
    lines.append(("OK   " if flag else "FALHA") + "  " + msg)


# 1) netlist da placa x esquema
board_nets = defaultdict(set)
for (ref, num, x, y, net, *_rest) in all_pads():
    if net:
        board_nets[net].add(f"{ref}.{num}")
rep(dict(board_nets) == L.EXPECTED, "netlist da placa igual à do esquema (%d redes, %d ligações)"
    % (len(L.EXPECTED), sum(len(v) for v in L.EXPECTED.values())))
for n in sorted(set(board_nets) | set(L.EXPECTED)):
    if board_nets.get(n) != L.EXPECTED.get(n):
        lines.append(f"       rede {n}: placa={sorted(board_nets.get(n, []))} esquema={sorted(L.EXPECTED.get(n, []))}")

items = copper_items()
by_key = defaultdict(list)
for key, g, kind, info in items:
    by_key[key].append((g, kind, info))

# 2) conectividade: cada rede é UM pedaço de cobre que cobre todos os seus pads
for net in L.EXPECTED:
    geoms = [g for g, _, _ in by_key[net]]
    u = unary_union(geoms)
    parts = list(getattr(u, "geoms", [u]))
    pads_ok = all(any(p.intersects(g) for p in parts) for g, k, _ in by_key[net] if k == "pad")
    rep(len(parts) == 1 and pads_ok, f"rede {net}: {len(parts)} pedaço(s) de cobre, {len(board_nets[net])} pads ligados")

# 3) isolamento entre redes diferentes (inclui pads sem rede e texto)
unions = {k: unary_union([g for g, _, _ in v]) for k, v in by_key.items()}
worst = (99, None)
viol = []
for a, b in itertools.combinations(unions, 2):
    d = unions[a].distance(unions[b])
    if d < worst[0]:
        worst = (d, (a, b))
    if d < L.CLEAR - 1e-6:
        viol.append((d, a, b))
rep(not viol, f"isolamento mínimo entre redes = {worst[0]:.2f} mm (exigido ≥ {L.CLEAR} mm; par mais próximo: {worst[1][0]} × {worst[1][1]})")
for d, a, b in sorted(viol):
    lines.append(f"       {a} × {b}: {d:.2f} mm")

# 4) cobre dentro da placa e longe da borda
bp = board_poly()
allcu = unary_union(list(unions.values()))
edge_d = bp.exterior.distance(allcu)
rep(bp.contains(allcu) and edge_d >= L.EDGE, f"cobre a ≥ {edge_d:.2f} mm da borda (exigido ≥ {L.EDGE} mm)")

# 5) larguras de trilha
pwr = {"GND", "+5V", "VBAT"}
bad = [(n, w) for n, w, _ in L.TRACKS if w < (1.5 if n in pwr else 1.0)]
rep(not bad, "larguras: sinal ≥ 1,0 mm, 5 V/bateria/GND ≥ 1,5 mm")

# 6) ilhas e furos
small = []
for (ref, num, x, y, net, shape, w, h, drill, label) in all_pads():
    ring = (min(w, h) - drill) / 2
    if ring < 0.44 or max(w, h) < 2.0 or not (0.8 <= drill <= 1.2):
        small.append(f"{ref}.{num} ({w}x{h}, furo {drill})")
rep(not small, "ilhas ≥ 2,0 mm (oval 1,9x2,6 nas barras fêmea), anel ≥ 0,45 mm, furos 0,8–1,2 mm")
for s in small:
    lines.append("       " + s)

rep(not L.JUMPERS, f"jumpers de fio: {len(L.JUMPERS)}")

print("\n".join(lines))
print("\nRESULTADO:", "PASSOU" if ok else "FALHOU")
sys.exit(0 if ok else 1)
