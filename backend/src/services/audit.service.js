'use strict';

const { query } = require('../config/database');
const logger    = require('../utils/logger');

/**
 * Registra uma ação no log de auditoria (audit_logs).
 * Nunca lança — falhas de auditoria não interrompem a operação principal.
 */
async function logAudit({
  orgId = null, workspaceId = null, userId = null,
  action, entityType = null, entityId = null, entityName = null,
  metadata = null, ip = null,
}) {
  try {
    await query(
      `INSERT INTO audit_logs
         (org_id, workspace_id, user_id, action, entity_type, entity_id, entity_name, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        orgId, workspaceId, userId, action,
        entityType, entityId, entityName,
        metadata ? JSON.stringify(metadata) : null,
        ip,
      ]
    );
  } catch (err) {
    logger.warn('audit log failed', { action, err: err.message });
  }
}

/**
 * Lista entradas de auditoria de um workspace com filtros opcionais.
 * Retorna mais recentes primeiro.
 */
async function listForWorkspace(workspaceId, {
  limit = 100, offset = 0,
  userId, action, entityType, search,
  from, to,
} = {}) {
  const params  = [workspaceId];
  const clauses = ['al.workspace_id = $1'];

  if (userId) {
    params.push(userId);
    clauses.push(`al.user_id = $${params.length}`);
  }
  if (action) {
    params.push(`%${action}%`);
    clauses.push(`al.action ILIKE $${params.length}`);
  }
  if (entityType) {
    params.push(entityType);
    clauses.push(`al.entity_type = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(al.action ILIKE $${params.length} OR al.entity_name ILIKE $${params.length} OR al.metadata::text ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (from) {
    params.push(from);
    clauses.push(`al.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`al.created_at <= $${params.length}`);
  }

  params.push(limit, offset);

  const r = await query(
    `SELECT al.id, al.action, al.entity_type, al.entity_id, al.entity_name,
            al.metadata, al.ip_address, al.created_at,
            u.name AS user_name, u.email AS user_email, u.avatar_url AS user_avatar
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows;
}

module.exports = { logAudit, listForWorkspace };
