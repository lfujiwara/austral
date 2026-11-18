#!/usr/bin/env bash
set -euo pipefail
dev="${DEV:?run through ./dev scenario}"
"$dev" wifi off
echo "wifi off"
sleep 90
"$dev" wifi on
echo "wifi on"
