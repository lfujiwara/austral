#!/usr/bin/env python3
"""Gera o projeto KiCad 9 (austral.kicad_pcb + regras) a partir de layout.py."""
import json, pathlib
import pcbnew
import layout as L

OUT = pathlib.Path(__file__).resolve().parent / "kicad"
OUT.mkdir(exist_ok=True)
mm = pcbnew.FromMM
V = lambda x, y: pcbnew.VECTOR2I(mm(x), mm(y))

b = pcbnew.BOARD()
b.SetCopperLayerCount(2)
nets = {}
for n in L.EXPECTED:
    ni = pcbnew.NETINFO_ITEM(b, n)
    b.Add(ni)
    nets[n] = ni


def seg(parent, layer, a, c, w=0.12):
    s = pcbnew.PCB_SHAPE(parent)
    s.SetShape(pcbnew.SHAPE_T_SEGMENT)
    s.SetStart(V(*a)); s.SetEnd(V(*c)); s.SetLayer(layer); s.SetWidth(mm(w))
    parent.Add(s)


def rect(parent, layer, x0, y0, x1, y1, w=0.12):
    for a, c in [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]:
        seg(parent, layer, a, c, w)


# contorno da placa
rect(b, pcbnew.Edge_Cuts, 0, 0, L.BOARD_W, L.BOARD_H, 0.1)

for ref, p in L.PARTS.items():
    xs = [q[1] for q in p["pads"]]; ys = [q[2] for q in p["pads"]]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    fp = pcbnew.FOOTPRINT(b)
    fp.SetReference(ref); fp.SetValue(p["value"])
    fp.SetPosition(V(cx, cy))
    b.Add(fp)
    for (num, x, y, net, shape, w, h, drill, label) in p["pads"]:
        pad = pcbnew.PAD(fp)
        pad.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
        pad.SetShape(pcbnew.PAD_SHAPE_CIRCLE if shape == "circle" else pcbnew.PAD_SHAPE_OVAL)
        pad.SetSize(V(w, h)); pad.SetDrillSize(V(drill, drill))
        pad.SetLayerSet(pcbnew.PAD.PTHMask())
        pad.SetNumber(num)
        fp.Add(pad)
        pad.SetPosition(V(x, y))
        if net:
            pad.SetNet(nets[net])
    if p["outline"]:
        rect(fp, pcbnew.F_Fab, *p["outline"])
    fp.Reference().SetPosition(V(cx, cy)); fp.Reference().SetLayer(pcbnew.F_Fab)
    fp.Value().SetLayer(pcbnew.F_Fab)

for net, width, pts in L.TRACKS:
    for a, c in zip(pts, pts[1:]):
        t = pcbnew.PCB_TRACK(b)
        t.SetStart(V(*a)); t.SetEnd(V(*c)); t.SetWidth(mm(width))
        t.SetLayer(pcbnew.B_Cu); t.SetNet(nets[net])
        b.Add(t)

for txt, cx, cy, hgt in L.COPPER_TEXT:
    t = pcbnew.PCB_TEXT(b)
    t.SetText(txt); t.SetLayer(pcbnew.B_Cu); t.SetMirrored(True)
    t.SetTextSize(V(hgt * 0.9, hgt)); t.SetTextThickness(mm(hgt * 0.18))
    t.SetPosition(V(cx, cy))
    b.Add(t)

pcb = OUT / "austral.kicad_pcb"
b.Save(str(pcb))

# Projeto + regras de projeto (DRC) para fabricação caseira
pro = {"meta": {"filename": "austral.kicad_pro", "version": 3},
       "board": {"design_settings": {"rules": {
           "min_clearance": 0.6, "min_track_width": 1.0, "min_through_hole_diameter": 0.8,
           "min_hole_clearance": 0.25, "min_copper_edge_clearance": 0.5}}},
       "net_settings": {"classes": [{"name": "Default", "clearance": 0.6, "track_width": 1.0,
                                      "via_diameter": 2.0, "via_drill": 0.8}], "meta": {"version": 3}}}
(OUT / "austral.kicad_pro").write_text(json.dumps(pro, indent=2))
(OUT / "austral.kicad_dru").write_text("""(version 1)
(rule "isolamento 0,6 mm entre redes"
  (constraint clearance (min 0.6mm)))
(rule "trilha de sinal >= 1,0 mm"
  (condition "A.Type == 'track'")
  (constraint track_width (min 1.0mm)))
(rule "potencia >= 1,5 mm"
  (condition "A.Type == 'track' && (A.NetName == 'GND' || A.NetName == '+5V' || A.NetName == 'VBAT')")
  (constraint track_width (min 1.5mm)))
(rule "furos 0,8 a 1,2 mm"
  (constraint hole_size (min 0.8mm) (max 1.2mm)))
(rule "anel >= 0,4 mm"
  (constraint annular_width (min 0.4mm)))
(rule "cobre a >= 0,5 mm da borda"
  (constraint edge_clearance (min 0.5mm)))
""")
print("salvo", pcb)
