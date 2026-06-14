'use strict';

const { query } = require('../config/database');
const logger    = require('../utils/logger');

/**
 * Registra uma ação sensível no log de auditoria (audit_logs).
 * Nunca lança — falhas de auditoria não devem interromper a operação principal.
 *
 * @param {object} opts
 * @param {string|null} [opts.orgId]
 * @param {string|null} [opts.workspaceId]
 * @param {string|null} [opts.userId]
 * @param {string}      opts.action      - ex: 'permission_profile.update', 'ai_key.update', '2fa.enable'
 * @param {string|null} [opts.entityType]
 * @param {string|null} [opts.entityId]
 * @param {object|null} [opts.metadata]
 * @param {string|null} [opts.ip]
 */
async function logAudit({ orgId = null, workspaceId = null, userId = null, action, entityType = null, entityId = null, metadata = null, ip = null }) {
  try {
    await query(
      `INSERT INTO audit_logs (org_id, workspace_id, user_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, workspaceId, userId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, ip]
    );
  } catch (err) {
    logger.warn('audit log failed', { action, err: err.message });
  }
}

/**
 * Lista entradas de auditoria de um workspace (mais recentes primeiro).
 */
async function listForWorkspace(workspaceId, { limit = 100 } = {}) {
  const r = await query(
    `SELECT al.id, al.action, al.entity_type, al.entity_id, al.metadata, al.ip_address, al.created_at,
            u.name AS user_name, u.email AS user_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.workspace_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );
  return r.rows;
}

module.exports = { logAudit, listForWorkspace };
