'use strict';

const { query } = require('../config/database');

// Cache de origens permitidas — evita consulta ao banco em todo request.
// TTL curto o suficiente para refletir mudanças de domínio custom rapidamente.
let cache = { origins: new Set(), expires: 0 };

async function getAllowedOrigins() {
  if (Date.now() < cache.expires) return cache.origins;

  const origins = new Set();
  origins.add(process.env.FRONTEND_URL || 'http://localhost:3000');
  origins.add('http://localhost:3000');

  try {
    const r = await query(
      `SELECT custom_domain FROM workspaces
       WHERE custom_domain_status = 'verified' AND custom_domain IS NOT NULL`
    );
    for (const row of r.rows) {
      origins.add(`https://${row.custom_domain}`);
      if (process.env.NODE_ENV !== 'production') {
        origins.add(`http://${row.custom_domain}`);
      }
    }
  } catch {
    // Banco ainda não disponível (ex: durante bootstrap) — usa apenas o default
  }

  cache = { origins, expires: Date.now() + 60_000 };
  return cache.origins;
}

/**
 * Valida a origem da requisição contra FRONTEND_URL + domínios customizados
 * (white-label) verificados. Usado tanto pelo middleware `cors` quanto pelo
 * CORS do Socket.io.
 */
function corsOriginValidator(origin, callback) {
  // Requests sem header Origin (server-to-server, curl, apps mobile) são permitidas
  if (!origin) return callback(null, true);

  getAllowedOrigins()
    .then((allowed) => callback(null, allowed.has(origin)))
    .catch(() => callback(null, false));
}

module.exports = { corsOriginValidator, getAllowedOrigins };
