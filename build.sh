#!/bin/bash
# =============================================================
# build.sh — Builda as imagens Docker no servidor
# Execute via SSH no servidor antes de subir a stack no Portainer
#
# Uso: bash build.sh
# Opcional: DOMAIN=imobi.exemplo.com GOOGLE_MAPS_API_KEY=xxx bash build.sh
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== GTW Imobi — Build das Imagens ==="
echo ""

echo "▶ Buildando backend..."
docker build -t gtw-imobi-backend:latest ./backend
echo "✓ Backend pronto"
echo ""

echo "▶ Buildando frontend..."
DOMAIN="${DOMAIN:-app.imobi360.digital}"
docker build \
  --build-arg NEXT_PUBLIC_API_URL="https://${DOMAIN}/api/v1" \
  --build-arg NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_API_KEY:-}" \
  -t gtw-imobi-frontend:latest ./frontend
echo "✓ Frontend pronto"
echo ""

echo "✅ Imagens buildadas com sucesso!"
echo ""
echo "Imagens disponíveis:"
docker images | grep gtw-imobi
echo ""
echo "Próximo passo: suba a stack pelo Portainer usando o docker-compose.yml"
echo "Não esqueça de configurar as variáveis de ambiente no Portainer:"
echo "  DOMAIN      = (domínio do gtw-imobi, ex: app.imobi360.digital)"
echo "  DB_PASSWORD = (senha forte)"
echo "  JWT_SECRET  = (string aleatória longa, mín. 32 caracteres)"
echo "  MINIO_USER     = (usuário do MinIO)"
echo "  MINIO_PASSWORD = (senha do MinIO, mín. 8 caracteres)"
