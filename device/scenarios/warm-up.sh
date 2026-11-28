#!/usr/bin/env bash
set -euo pipefail
dev="${DEV:?run through ./dev scenario}"
for air in -23.5 -20 -16 -12.5 -10 -8; do
  "$dev" temps "$air"
  echo "air $air °C"
  sleep 20
done
echo "holding above the threshold; the local alarm changes after 10 minutes; the buzzer stays off"
sleep 720
for air in -12 -16 -20 -23.5; do
  "$dev" temps "$air"
  echo "air $air °C"
  sleep 20
done
