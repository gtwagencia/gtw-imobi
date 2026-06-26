'use strict';

const webpush = require('web-push');
const { query } = require('../config/database');

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || null;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:contato@gtwagencia.com.br';

function isConfigured() {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

if (isConfigured()) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function getPublicKey() {
  return VAPID_PUBLIC_KEY;
}

// ── Inscrições ──────────────────────────────────────────────────────────────

async function subscribe(userId, { endpoint, keys }) {
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw Object.assign(new Error('Inscrição de push inválida'), { status: 400 });
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, endpoint, keys.p256dh, keys.auth]
  );
}

async function unsubscribe(userId, endpoint) {
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
}

// ── Envio ───────────────────────────────────────────────────────────────────

async function sendToUser(userId, payload) {
  if (!isConfigured()) return;

  const r = await query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  const body = JSON.stringify(payload);

  await Promise.all(r.rows.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Inscrição expirada/revogada — remove para não tentar de novo
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {});
      } else {
        console.error('[push] sendNotification error:', err.message);
      }
    }
  }));
}

// Envia para todos os membros do workspace que têm dispositivos inscritos
async function sendToWorkspace(workspaceId, payload, { excludeUserId } = {}) {
  if (!isConfigured()) return;

  const params = [workspaceId];
  let where = 'wm.workspace_id = $1';
  if (excludeUserId) {
    params.push(excludeUserId);
    where += ` AND ps.user_id != $${params.length}`;
  }

  const r = await query(
    `SELECT DISTINCT ps.user_id
     FROM push_subscriptions ps
     JOIN workspace_memberships wm ON wm.user_id = ps.user_id
     WHERE ${where}`,
    params
  );

  await Promise.all(r.rows.map((row) => sendToUser(row.user_id, payload)));
}

// Envia apenas para admins/owners do workspace.
// Usado em notificações de conversas — brokers só recebem se a conversa
// estiver atribuída a eles (via sendToUser separado no chamador).
async function sendToWorkspaceAdmins(workspaceId, payload) {
  if (!isConfigured()) return;

  const r = await query(
    `SELECT DISTINCT ps.user_id
     FROM push_subscriptions ps
     JOIN workspace_memberships wm ON wm.user_id = ps.user_id
     WHERE wm.workspace_id = $1 AND wm.role IN ('admin', 'owner')`,
    [workspaceId]
  );

  await Promise.all(r.rows.map((row) => sendToUser(row.user_id, payload)));
}

module.exports = {
  isConfigured,
  getPublicKey,
  subscribe,
  unsubscribe,
  sendToUser,
  sendToWorkspace,
  sendToWorkspaceAdmins,
};
