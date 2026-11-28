#!/usr/bin/env bash
set -euo pipefail
dev="${DEV:?run through ./dev scenario}"
"$dev" temps unplugged
echo "air probe unplugged"
sleep 60
"$dev" temps -21.25
echo "air probe back"
