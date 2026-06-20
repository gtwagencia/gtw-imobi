'use strict';

const fs     = require('fs');
const path   = require('path');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// ── White-label: geração de configuração dinâmica do Traefik ────────────────
//
// Para cada workspace com domínio customizado verificado (`custom_domain_status
// = 'verified'`), gera roteadores HTTP no Traefik (file provider) apontando
// para os mesmos serviços do frontend/backend/MinIO, com certificado Let's
// Encrypt emitido automaticamente via HTTP challenge (`letsencryptresolver`).
//
// Requer:
// - Volume compartilhado entre o backend e o Traefik (ver docker-compose.yml
//   e traefik/docker-compose.traefik.yml — volume `gtw_traefik_dynamic`).
// - Traefik configurado com `--providers.file.directory=<dir> --providers.file.watch=true`.
// - Variável de ambiente TRAEFIK_DYNAMIC_DIR apontando para o diretório montado
//   (ex: /app/traefik-dynamic). Se não definida, a geração é desativada (no-op),
//   o que é seguro para ambientes de desenvolvimento.
//
// TRAEFIK_DYNAMIC_FILE e TRAEFIK_WL_PREFIX permitem que múltiplos projetos
// (ex: gtw-platform e gtw-imobi) compartilhem o mesmo volume/instância do
// Traefik sem colidir nomes de arquivo nem de routers/services/middlewares
// gerados (cada projeto usa um arquivo e um prefixo "wl-*" próprios).

const DYNAMIC_DIR  = process.env.TRAEFIK_DYNAMIC_DIR  || null;
const OUTPUT_FILE  = process.env.TRAEFIK_DYNAMIC_FILE || 'custom-domains.yml';
const WL_PREFIX    = process.env.TRAEFIK_WL_PREFIX    || 'wl';

const FRONTEND_URL = process.env.TRAEFIK_FRONTEND_URL || 'http://gtw-frontend:3000';
const BACKEND_URL  = process.env.TRAEFIK_BACKEND_URL  || 'http://gtw-backend:4000';
const MINIO_URL    = process.env.TRAEFIK_MINIO_URL    || 'http://gtw-minio:9000';

/** Identificador curto e seguro para usar em nomes de router/service do Traefik. */
function safeId(workspaceId) {
  return String(workspaceId).replace(/[^a-z0-9]/gi, '').slice(0, 12);
}

function buildRouterBlock(workspace) {
  const id     = safeId(workspace.id);
  const domain = workspace.custom_domain;

  return `
    ${WL_PREFIX}-${id}-frontend:
      rule: "Host(\`${domain}\`)"
      entryPoints: ["websecure"]
      service: ${WL_PREFIX}-frontend
      priority: 1
      tls:
        certResolver: letsencryptresolver
        domains:
          - main: "${domain}"
    ${WL_PREFIX}-${id}-api:
      rule: "Host(\`${domain}\`) && PathPrefix(\`/api\`)"
      entryPoints: ["websecure"]
      service: ${WL_PREFIX}-backend
      priority: 20
      tls:
        certResolver: letsencryptresolver
        domains:
          - main: "${domain}"
    ${WL_PREFIX}-${id}-uploads:
      rule: "Host(\`${domain}\`) && PathPrefix(\`/uploads\`)"
      entryPoints: ["websecure"]
      service: ${WL_PREFIX}-backend
      priority: 10
      tls:
        certResolver: letsencryptresolver
        domains:
          - main: "${domain}"
    ${WL_PREFIX}-${id}-files:
      rule: "Host(\`${domain}\`) && PathPrefix(\`/files\`)"
      entryPoints: ["websecure"]
      service: ${WL_PREFIX}-minio
      middlewares: ["${WL_PREFIX}-minio-strip"]
      priority: 25
      tls:
        certResolver: letsencryptresolver
        domains:
          - main: "${domain}"
    ${WL_PREFIX}-${id}-ws:
      rule: "Host(\`${domain}\`) && PathPrefix(\`/socket.io\`)"
      entryPoints: ["websecure"]
      service: ${WL_PREFIX}-backend-ws
      priority: 15
      tls:
        certResolver: letsencryptresolver
        domains:
          - main: "${domain}"`;
}

const SHARED_SERVICES_AND_MIDDLEWARES = `
  services:
    ${WL_PREFIX}-frontend:
      loadBalancer:
        servers:
          - url: "${FRONTEND_URL}"
    ${WL_PREFIX}-backend:
      loadBalancer:
        servers:
          - url: "${BACKEND_URL}"
    ${WL_PREFIX}-backend-ws:
      loadBalancer:
        servers:
          - url: "${BACKEND_URL}"
        sticky:
          cookie:
            name: ${WL_PREFIX}_ws_sticky
    ${WL_PREFIX}-minio:
      loadBalancer:
        servers:
          - url: "${MINIO_URL}"
  middlewares:
    ${WL_PREFIX}-minio-strip:
      stripPrefix:
        prefixes: ["/files"]`;

/**
 * Regenera o arquivo de configuração dinâmica do Traefik com um roteador
 * (frontend + /api + /uploads + /files + /socket.io) para cada domínio
 * customizado verificado. Nunca lança erro — apenas registra um aviso.
 */
async function regenerateDomainsConfig() {
  if (!DYNAMIC_DIR) return;

  try {
    const r = await query(
      `SELECT id, custom_domain FROM workspaces
       WHERE custom_domain_status = 'verified' AND custom_domain IS NOT NULL`
    );

    let content;
    if (!r.rows.length) {
      content = '# Nenhum domínio customizado verificado.\n';
    } else {
      content = ['http:', '  routers:', ...r.rows.map(buildRouterBlock), SHARED_SERVICES_AND_MIDDLEWARES]
        .join('\n') + '\n';
    }

    fs.mkdirSync(DYNAMIC_DIR, { recursive: true });
    fs.writeFileSync(path.join(DYNAMIC_DIR, OUTPUT_FILE), content, 'utf8');
  } catch (err) {
    logger.warn('Falha ao gerar configuração dinâmica do Traefik', {
      err: err.message, dir: DYNAMIC_DIR,
      hint: 'Verifique se o volume TRAEFIK_DYNAMIC_DIR está montado no container',
    });
  }
}

module.exports = { regenerateDomainsConfig };
