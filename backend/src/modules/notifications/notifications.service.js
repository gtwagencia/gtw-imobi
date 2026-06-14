'use strict';

const { query } = require('../../config/database');

async function listMine(workspaceId, userId) {
  const r = await query(
    `SELECT * FROM crm_notifications
     WHERE workspace_id = $1 AND user_id = $2 AND is_read = false
     ORDER BY created_at DESC
     LIMIT 50`,
    [workspaceId, userId]
  );
  return r.rows;
}

async function markRead(id, userId) {
  await query(
    `UPDATE crm_notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

async function markAllRead(workspaceId, userId) {
  await query(
    `UPDATE crm_notifications SET is_read = true WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
}

/**
 * Cria uma notificação interna (SLA vencido, lead esquecido...) para um
 * usuário e a entrega em tempo real via socket — o front filtra pelo
 * próprio user_id ao receber o evento na sala do workspace.
 */
async function create({ workspaceId, userId, conversationId, type, title, message }, io) {
  const r = await query(
    `INSERT INTO crm_notifications (workspace_id, user_id, conversation_id, type, title, message)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [workspaceId, userId, conversationId || null, type, title, message || null]
  );
  const notif = r.rows[0];
  io?.to(`ws:${workspaceId}`).emit('crm:notification', notif);
  return notif;
}

module.exports = { listMine, markRead, markAllRead, create };
