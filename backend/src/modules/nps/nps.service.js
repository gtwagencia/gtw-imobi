'use strict';

const { query } = require('../../config/database');

// ── Enviar NPS após visita realizada ────────────────────────────────────────

async function sendNpsAfterVisit(workspaceId, visitId) {
  const visitRes = await query(
    `SELECT v.*, c.phone AS contact_phone, c.name AS contact_name, c.id AS contact_id,
            p.title AS property_title, p.code AS property_code
     FROM property_visits v
     JOIN contacts c ON c.id = v.contact_id
     LEFT JOIN properties p ON p.id = v.property_id
     WHERE v.id = $1 AND v.workspace_id = $2`,
    [visitId, workspaceId]
  );
  const visit = visitRes.rows[0];
  if (!visit || visit.nps_sent_at) return null;

  const wsRes = await query(
    `SELECT nps_enabled, nps_inbox_id, nps_message_template, nps_delay_hours FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const ws = wsRes.rows[0];
  if (!ws?.nps_enabled || !ws.nps_inbox_id) return null;

  const npsRes = await query(
    `INSERT INTO nps_responses (workspace_id, visit_id, contact_id, sent_at)
     VALUES ($1, $2, $3, NOW()) RETURNING *`,
    [workspaceId, visitId, visit.contact_id]
  );
  const nps = npsRes.rows[0];

  await query('UPDATE property_visits SET nps_sent_at = NOW() WHERE id = $1', [visitId]);

  const template = ws.nps_message_template ||
    `Olá, ${visit.contact_name}! 😊\n\nObrigado pela visita ao imóvel ${visit.property_code || ''}!\n\nComo foi sua experiência? Responda com um número de 0 a 10:\n\n0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟\n\n(0 = muito ruim | 10 = excelente)`;

  // Enviar via sistema de conversas existente
  try {
    const msgSvc = require('../messages/messages.service');
    await msgSvc.sendOutbound(workspaceId, ws.nps_inbox_id, visit.contact_phone, template);
  } catch (err) {
    // Se falhar o envio, não desfaz o registro NPS
    require('../../utils/logger').warn('NPS send failed', { visitId, err: err.message });
  }

  return nps;
}

// ── Registrar resposta do cliente ───────────────────────────────────────────

async function recordResponse(npsId, score, comment) {
  const r = await query(
    `UPDATE nps_responses SET score = $1, comment = $2, responded_at = NOW() WHERE id = $3 RETURNING *`,
    [score, comment || null, npsId]
  );
  return r.rows[0] || null;
}

// ── Métricas NPS ────────────────────────────────────────────────────────────

async function getMetrics(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       COUNT(*) FILTER (WHERE score IS NOT NULL)                         AS total_responses,
       ROUND(AVG(score) FILTER (WHERE score IS NOT NULL), 1)             AS avg_score,
       COUNT(*) FILTER (WHERE score >= 9)                                AS promoters,
       COUNT(*) FILTER (WHERE score BETWEEN 7 AND 8)                    AS neutrals,
       COUNT(*) FILTER (WHERE score <= 6)                                AS detractors,
       COUNT(*)                                                          AS total_sent
     FROM nps_responses
     WHERE workspace_id = $1
       AND created_at BETWEEN $2 AND $3`,
    [workspaceId, start, end]
  );

  const row = r.rows[0];
  const total = parseInt(row.total_responses) || 0;
  const promoters  = parseInt(row.promoters)  || 0;
  const detractors = parseInt(row.detractors) || 0;
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

  return { ...row, nps_score: nps };
}

async function listRecent(workspaceId, limit = 20) {
  const r = await query(
    `SELECT n.*, c.name AS contact_name, c.phone AS contact_phone,
            p.title AS property_title, p.code AS property_code
     FROM nps_responses n
     LEFT JOIN contacts c ON c.id = n.contact_id
     LEFT JOIN property_visits v ON v.id = n.visit_id
     LEFT JOIN properties p ON p.id = v.property_id
     WHERE n.workspace_id = $1 AND n.score IS NOT NULL
     ORDER BY n.responded_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );
  return r.rows;
}

module.exports = { sendNpsAfterVisit, recordResponse, getMetrics, listRecent };
