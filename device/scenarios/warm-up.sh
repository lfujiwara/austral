#!/usr/bin/env bash
set -euo pipefail
dev="${DEV:?run through ./dev scenario}"
for air in 0 2 4 5 6 8; do
  "$dev" temps "$air"
  echo "air $air °C"
  sleep 20
done
echo "holding above the 5 °C threshold; the local alarm changes after 10 minutes; the buzzer stays off"
sleep 720
for air in 4 2 0; do
  "$dev" temps "$air"
  echo "air $air °C"
  sleep 20
done
