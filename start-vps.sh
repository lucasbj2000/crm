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

# V26.18: mantener un secreto interno estable entre Gateway y tenants.
# Si no viene definido en .env, se genera una sola vez dentro del storage persistente.
if [ -z "${CRM_GATEWAY_SECRET:-}" ]; then
  SECRET_DIR="$ROOT/storage/gateway"
  SECRET_FILE="$SECRET_DIR/internal-gateway-secret"
  mkdir -p "$SECRET_DIR"
  chmod 700 "$SECRET_DIR" 2>/dev/null || true
  if [ ! -s "$SECRET_FILE" ]; then
    umask 077
    node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("hex"))' > "$SECRET_FILE"
  fi
  export CRM_GATEWAY_SECRET="$(cat "$SECRET_FILE")"
fi

exec node "$ROOT/gateway/v25-gateway.mjs"
