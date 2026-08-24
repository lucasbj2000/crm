#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi
export PORT="${PORT:-3030}"
export GATEWAY_HOST="${GATEWAY_HOST:-0.0.0.0}"
exec node "$ROOT/gateway/gateway.mjs"
