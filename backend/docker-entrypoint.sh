#!/bin/sh
set -e

# Corrige permissões do volume de uploads (montado como root pelo Docker)
mkdir -p "${UPLOAD_DIR:-/app/uploads}"
chown -R nodeuser:nodejs "${UPLOAD_DIR:-/app/uploads}" 2>/dev/null || true

# Roda migrations automaticamente na inicialização
echo "[entrypoint] Rodando migrations..."
su-exec nodeuser node src/db/migrate.js

exec su-exec nodeuser "$@"
