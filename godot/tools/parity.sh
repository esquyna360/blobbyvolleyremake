#!/usr/bin/env bash
# Roda a mesma sequência de entradas nas duas físicas e compara byte a byte.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${TMPDIR:-$HOME/code/.dev-logs/blobby}/parity"
mkdir -p "$OUT"
GODOT_USER="$HOME/Library/Application Support/Godot/app_userdata/Blobby Volley Selva/parity_godot.txt"
fail=0
for cfg in "default:" "default:--open" "tennis:" "blitz:" "jumpingjack:--open"; do
  rules="${cfg%%:*}"; extra="${cfg#*:}"
  node --experimental-transform-types godot/tools/parity_ref.ts "$OUT/ts.txt" --rules="$rules" $extra >/dev/null 2>&1
  godot --headless --path godot --script res://tools/parity.gd -- --rules="$rules" $extra >/dev/null 2>&1
  if cmp -s "$OUT/ts.txt" "$GODOT_USER"; then
    echo "ok    $rules ${extra:-walls}"
  else
    echo "DIFF  $rules ${extra:-walls}"; fail=1
  fi
done
exit $fail
