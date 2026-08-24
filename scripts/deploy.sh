#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${HOSTINGER_APP_PATH:-/opt/whatsbot-crm}"
cd "$APP_DIR"

git fetch origin main
git pull --ff-only origin main
docker compose up -d --build --remove-orphans
docker compose ps
