#!/usr/bin/env bash
set -euo pipefail
dev="${DEV:?run through ./dev scenario}"
"$dev" temps -23.5 -21.25 unplugged
echo "ambient probe unplugged"
sleep 60
"$dev" temps -23.5 -21.25 21.0
echo "ambient probe back"
