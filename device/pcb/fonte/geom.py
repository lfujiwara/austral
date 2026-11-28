"""Formas do cobre (shapely) a partir de layout.py — usadas na checagem e nos desenhos."""
from shapely.geometry import Point, LineString, Polygon, box
from shapely.ops import unary_union
from shapely import affinity
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties
import layout as L

FONT = FontProperties(family="DejaVu Sans", weight="bold")


def pad_shape(x, y, shape, w, h):
    if shape == "circle":
        return Point(x, y).buffer(w / 2, 64)
    # oval: retângulo de pontas redondas
    if h >= w:
        r = w / 2
        return LineString([(x, y - (h / 2 - r)), (x, y + (h / 2 - r))]).buffer(r, 64)
    r = h / 2
    return LineString([(x - (w / 2 - r), y), (x + (w / 2 - r), y)]).buffer(r, 64)


def all_pads():
    """[(ref, num, x, y, net, shape, w, h, drill, label)]"""
    out = []
    for ref, p in L.PARTS.items():
        for (num, x, y, net, shape, w, h, drill, label) in p["pads"]:
            out.append((ref, num, x, y, net, shape, w, h, drill, label))
    return out


def text_shape(txt, cx, cy, height, mirror=True):
    """Texto em cobre que lê certo do lado do cobre => espelhado na vista de cima."""
    tp = TextPath((0, 0), txt, size=height, prop=FONT)
    polys = [Polygon(p) for p in tp.to_polygons() if len(p) >= 3]
    geom = Polygon()
    for p in polys:
        geom = geom.symmetric_difference(p.buffer(0))
    minx, miny, maxx, maxy = geom.bounds
    geom = affinity.translate(geom, -(minx + maxx) / 2, -(miny + maxy) / 2)
    geom = affinity.scale(geom, 1, -1, origin=(0, 0))      # y para baixo
    if mirror:
        geom = affinity.scale(geom, -1, 1, origin=(0, 0))
    return affinity.translate(geom, cx, cy)


def copper_items():
    """[(rede ou id isolado, geometria, tipo, info)]"""
    items = []
    for (ref, num, x, y, net, shape, w, h, drill, label) in all_pads():
        key = net if net else f"(sem rede) {ref}.{num}"
        items.append((key, pad_shape(x, y, shape, w, h), "pad", f"{ref}.{num}"))
    for net, width, pts in L.TRACKS:
        items.append((net, LineString(pts).buffer(width / 2, 32), "track", None))
    for i, (txt, cx, cy, hgt) in enumerate(L.COPPER_TEXT):
        items.append((f"(texto) {txt}", text_shape(txt, cx, cy, hgt), "text", txt))
    return items


def copper_union():
    return unary_union([g for _, g, _, _ in copper_items()])


def board_poly():
    return box(0, 0, L.BOARD_W, L.BOARD_H)
