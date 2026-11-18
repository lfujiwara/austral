#!/usr/bin/env bash
set -euo pipefail
dev="${DEV:?run through ./dev scenario}"
for product in -23.5 -20 -16 -12.5 -10 -8; do
  "$dev" temps "$product" -15 21.0
  echo "product $product °C"
  sleep 20
done
echo "holding above the threshold; the local alarm fires after 10 minutes"
sleep 720
for product in -12 -16 -20 -23.5; do
  "$dev" temps "$product" -21.25 21.0
  echo "product $product °C"
  sleep 20
done
