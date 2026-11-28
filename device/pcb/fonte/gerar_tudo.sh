#!/usr/bin/env bash
# Regera tudo a partir de layout.py: KiCad + DRC, checagem própria, desenhos e arquivos de fabricação.
set -euo pipefail
cd "$(dirname "$0")"
python3 gerar_kicad.py
( cd kicad && kicad-cli pcb drc --severity-all --exit-code-violations -o drc.rpt austral.kicad_pcb )
python3 checar.py | tee checagem.txt
python3 desenhar.py
mkdir -p kicad/fab
kicad-cli pcb export gerbers -l B.Cu,Edge.Cuts -o kicad/fab/ kicad/austral.kicad_pcb >/dev/null
kicad-cli pcb export drill --format excellon --excellon-units mm -o kicad/fab/ kicad/austral.kicad_pcb >/dev/null
kicad-cli pcb export svg -l B.Cu,Edge.Cuts --mode-single --exclude-drawing-sheet --page-size-mode 2 -o kicad/fab/kicad_B.Cu_vista_de_cima.svg kicad/austral.kicad_pcb >/dev/null
echo "OK: tudo regerado"
