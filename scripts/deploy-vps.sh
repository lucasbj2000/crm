#!/usr/bin/env bash
set -Eeuo pipefail

LIVE="${CRM_LIVE_DIR:-/opt/crm/crm-live}"
ROOT="${CRM_ROOT_DIR:-/opt/crm}"
REPO="${CRM_GIT_REPOSITORY:-https://github.com/lucasbj2000/crm.git}"
PROCESS="${CRM_PM2_PROCESS:-crm-v23-gateway}"
DOMAIN="${CRM_DOMAIN:-iciia.online}"
EXPECTED_SHA="${1:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGE="$ROOT/crm-release-$STAMP"
BACKUP="$ROOT/crm-live-backup-$STAMP"
FAILED="$ROOT/crm-failed-$STAMP"

abort() {
  echo "ERROR: $1" >&2
  echo "No se modifico la version activa." >&2
  exit 1
}

echo "=== VERIFICACION PREVIA ==="
test "$(id -u)" -eq 0 || abort "ejecuta este script como root."
test -d "$LIVE/.git" || abort "$LIVE no es el repositorio activo esperado."
test -L "$LIVE/storage" || abort "storage no es un enlace persistente."

STORAGE_TARGET="$(readlink -f "$LIVE/storage")"
test -d "$STORAGE_TARGET" || abort "no existe el almacenamiento persistente: $STORAGE_TARGET"

for COMMAND in git node npm pm2 curl; do
  command -v "$COMMAND" >/dev/null || abort "falta el comando requerido: $COMMAND"
done

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
test "$NODE_MAJOR" -ge 22 || abort "se necesita Node.js 22 o superior."

AVAILABLE_KB="$(df -Pk "$ROOT" | awk 'NR == 2 { print $4 }')"
test "${AVAILABLE_KB:-0}" -ge 1048576 || abort "se necesita al menos 1 GB libre en $ROOT."

CURRENT_SHA="$(git -C "$LIVE" rev-parse HEAD)"
TARGET_SHA="$(git ls-remote "$REPO" refs/heads/main | awk 'NR == 1 { print $1 }')"
test -n "$TARGET_SHA" || abort "no se pudo consultar la rama main en GitHub."

if test -n "$EXPECTED_SHA" && test "$TARGET_SHA" != "$EXPECTED_SHA"; then
  abort "main apunta a $TARGET_SHA y se esperaba $EXPECTED_SHA."
fi

echo "Version actual: ${CURRENT_SHA:0:8}"
echo "Version de GitHub: ${TARGET_SHA:0:8}"
echo "Storage persistente: $STORAGE_TARGET"
echo "Dominio de produccion: https://$DOMAIN"

if test "$CURRENT_SHA" = "$TARGET_SHA"; then
  echo "=== CRM YA ACTUALIZADO ==="
  exit 0
fi

echo "=== PREPARANDO NUEVA VERSION ==="
test ! -e "$STAGE" || abort "ya existe el directorio temporal $STAGE."
git clone --depth 1 --branch main --single-branch "$REPO" "$STAGE"
ACTUAL_SHA="$(git -C "$STAGE" rev-parse HEAD)"
test "$ACTUAL_SHA" = "$TARGET_SHA" || abort "el clon no coincide con la version consultada."

if test -f "$LIVE/.env"; then
  cp -a "$LIVE/.env" "$STAGE/.env"
fi

ln -s "$STORAGE_TARGET" "$STAGE/storage"
chmod +x "$STAGE/start-vps.sh" "$STAGE/scripts/deploy-vps.sh"

echo "=== INSTALANDO Y PROBANDO V26.9 ==="
(
  cd "$STAGE/app"
  npm ci --omit=dev
)

node --check "$STAGE/app/server.mjs"
node --check "$STAGE/app/lib/domain.mjs"
node --check "$STAGE/app/lib/domain-v26.mjs"
node --check "$STAGE/app/lib/v25-4-server-patches.mjs"
node --check "$STAGE/app/lib/v25-6-security-patches.mjs"
node --check "$STAGE/app/lib/v25-7-form-patches.mjs"
node --check "$STAGE/app/lib/v25-8-report-ai-patches.mjs"
node --check "$STAGE/app/lib/v25-9-support-patches.mjs"
node --check "$STAGE/app/lib/v25-10-social-patches.mjs"
node --check "$STAGE/app/lib/v25-11-omnichannel-patches.mjs"
node --check "$STAGE/app/lib/v25-12-social-platform-patches.mjs"
node --check "$STAGE/app/lib/v26-2-whatsapp-patches.mjs"
node --check "$STAGE/app/lib/v26-3-qr-recovery-patches.mjs"
node --check "$STAGE/app/lib/v26-4-platform-reliability-catalog-patches.mjs"
node --check "$STAGE/app/lib/v26-5-media-reliability-patches.mjs"
node --check "$STAGE/app/lib/v26-6-media-retry-patches.mjs"
node --check "$STAGE/app/lib/v26-8-whatsapp-edit-patches.mjs"
node --check "$STAGE/app/lib/v26-9-access-control-patches.mjs"
node --check "$STAGE/app/public/app.js"
node --check "$STAGE/app/public/v22.js"
node --check "$STAGE/app/public/v24.js"
node --check "$STAGE/app/public/v24-1.js"
node --check "$STAGE/app/public/v25-2-1.js"
node --check "$STAGE/app/public/v25-3.js"
node --check "$STAGE/app/public/v25-4.js"
node --check "$STAGE/app/public/v25-4-1.js"
node --check "$STAGE/app/public/v25-5.js"
node --check "$STAGE/app/public/v25-6.js"
node --check "$STAGE/app/public/v25-7.js"
node --check "$STAGE/app/public/v25-8.js"
node --check "$STAGE/app/public/v25-8-1.js"
node --check "$STAGE/app/public/v25-9.js"
node --check "$STAGE/app/public/v25-10.js"
node --check "$STAGE/app/public/v25-11.js"
node --check "$STAGE/app/public/v25-12.js"
node --check "$STAGE/app/public/v26-1.js"
node --check "$STAGE/app/public/v26-2.js"
node --check "$STAGE/app/public/v26-3.js"
node --check "$STAGE/app/public/v26-4.js"
node --check "$STAGE/app/public/v26-6.js"
node --check "$STAGE/app/public/v26-7.js"
node --check "$STAGE/app/public/v26-8.js"
node --check "$STAGE/app/public/v26-9.js"
node --check "$STAGE/app/public/form-public.js"
node --check "$STAGE/app/public/v25.js"
node --check "$STAGE/app/public/sw.js"
node --check "$STAGE/gateway/gateway.mjs"
node --check "$STAGE/gateway/lib/v25-gateway-patches.mjs"
node --check "$STAGE/gateway/lib/v25-5-gateway-patches.mjs"
node --check "$STAGE/gateway/lib/v25-6-gateway-security-patches.mjs"
node --check "$STAGE/gateway/lib/v25-12-social-platform-patches.mjs"
node --check "$STAGE/gateway/lib/v26-4-tenant-reliability-patches.mjs"
node --check "$STAGE/gateway/public/master-v25-5.js"
node --check "$STAGE/gateway/public/master-v25-5-1.js"
node --check "$STAGE/gateway/public/master-v25-12.js"
node --check "$STAGE/gateway/v25-gateway.mjs"
node --check "$STAGE/gateway/setup-master.mjs"

node "$STAGE/app/test/v24-patches.mjs"
node "$STAGE/app/test/v24-1-ui.mjs"
node "$STAGE/app/test/v25-ui.mjs"
node "$STAGE/app/test/v25-3-navigation-responsive.mjs"
node "$STAGE/app/test/v25-4-admin-contacts.mjs"
node "$STAGE/app/test/v25-4-2-compact-delete.mjs"
node "$STAGE/app/test/v25-5-pwa.mjs"
node "$STAGE/app/test/v25-6-mobile-security.mjs"
node "$STAGE/app/test/v25-7-form-mobile.mjs"
node "$STAGE/app/test/v25-8-ai-reports.mjs"
node "$STAGE/app/test/v25-9-support.mjs"
node "$STAGE/app/test/v25-10-social-channels.mjs"
node "$STAGE/app/test/v25-11-oauth-unified-inbox.mjs"
node "$STAGE/app/test/v26-ui.mjs"
node "$STAGE/app/test/v26-2-whatsapp-history.mjs"
node "$STAGE/app/test/v26-3-qr-recovery.mjs"
node "$STAGE/app/test/v26-4-catalog-reliability.mjs"
node "$STAGE/app/test/v26-5-media-reliability.mjs"
node "$STAGE/app/test/v26-6-media-silent-sync.mjs"
node "$STAGE/app/test/v26-8-whatsapp-edits.mjs"
node "$STAGE/app/test/v26-9-access-control.mjs"
node "$STAGE/app/test/feature-smoke.mjs"
node "$STAGE/app/test/v25-message-smoke.mjs"
node "$STAGE/app/test/v24-transfer-smoke.mjs"
node "$STAGE/gateway/test/v25-gateway-patches.mjs"
node "$STAGE/gateway/test/v25-5-master-personnel.mjs"
node "$STAGE/gateway/test/v25-6-security.mjs"
node "$STAGE/gateway/test/v25-12-social-platform.mjs"
node "$STAGE/gateway/test/v26-4-tenant-reliability.mjs"
node "$STAGE/gateway/test/master-isolation.mjs"
node "$STAGE/gateway/test/v25-control-plane.mjs"

rollback_crm() {
  set +e
  echo "=== RESTAURANDO VERSION ANTERIOR ==="
  if test -d "$LIVE" && test -d "$BACKUP"; then
    mv "$LIVE" "$FAILED"
    mv "$BACKUP" "$LIVE"
    pm2 startOrRestart "$LIVE/ecosystem.config.cjs" --update-env
    pm2 save
    echo "Rollback completado."
    echo "Version fallida conservada en: $FAILED"
  else
    echo "No se pudo completar el rollback automaticamente." >&2
    echo "Revisa estas rutas: $LIVE y $BACKUP" >&2
  fi
}

echo "=== CAMBIANDO PRODUCCION ==="
echo "Respaldo de codigo: $BACKUP"
mv "$LIVE" "$BACKUP"
mv "$STAGE" "$LIVE"

if ! pm2 startOrRestart "$LIVE/ecosystem.config.cjs" --update-env; then
  rollback_crm
  exit 1
fi

READY=0
for ATTEMPT in $(seq 1 30); do
  if curl -fsS --max-time 5 "http://127.0.0.1:3030/api/health" >/dev/null; then
    READY=1
    break
  fi
  sleep 2
done

if test "$READY" -ne 1; then
  pm2 logs "$PROCESS" --lines 100 --nostream || true
  rollback_crm
  exit 1
fi

if ! curl -fsS --max-time 15 \
  --resolve "$DOMAIN:443:127.0.0.1" \
  "https://$DOMAIN/api/health" >/dev/null; then
  echo "ADVERTENCIA: el CRM interno funciona, pero fallo la comprobacion HTTPS local para https://$DOMAIN."
  pm2 logs "$PROCESS" --lines 60 --nostream || true
fi

pm2 save

echo "=== DESPLIEGUE COMPLETADO ==="
echo "Commit activo: $ACTUAL_SHA"
echo "Storage conservado: $STORAGE_TARGET"
echo "Respaldo conservado: $BACKUP"
pm2 describe "$PROCESS" | sed -n '1,45p'
echo "CRM EMPRESAS: https://$DOMAIN/login"
echo "ADMIN MAESTRO: https://$DOMAIN/master"
