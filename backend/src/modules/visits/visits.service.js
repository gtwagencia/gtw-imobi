'use strict';

const { query } = require('../../config/database');

const SELECT_BASE = `
  SELECT v.*,
         p.code  AS property_code,
         p.title AS property_title,
         (SELECT pm.url FROM property_media pm
           WHERE pm.property_id = p.id AND pm.is_cover = true LIMIT 1) AS property_cover_url,
         ct.name  AS contact_name,
         ct.phone AS contact_phone,
         u.name   AS assignee_name
  FROM property_visits v
  JOIN properties p       ON p.id = v.property_id
  LEFT JOIN contacts ct   ON ct.id = v.contact_id
  LEFT JOIN users u       ON u.id = v.assignee_id
`;

// ── List ──────────────────────────────────────────────────────────────────

async function list(workspaceId, { status, assigneeId, from, to } = {}) {
  const params = [workspaceId];
  let where = 'WHERE v.workspace_id = $1';

  if (status) {
    params.push(status);
    where += ` AND v.status = $${params.length}`;
  }
  if (assigneeId) {
    params.push(assigneeId);
    where += ` AND v.assignee_id = $${params.length}`;
  }
  if (from) {
    params.push(from);
    where += ` AND v.scheduled_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND v.scheduled_at <= $${params.length}`;
  }

  const r = await query(`${SELECT_BASE} ${where} ORDER BY v.scheduled_at ASC`, params);
  return r.rows;
}

// ── Create ────────────────────────────────────────────────────────────────

async function create(workspaceId, {
  propertyId, contactId, conversationId, assigneeId, scheduledAt, notes, createdByAi,
}) {
  const r = await query(
    `INSERT INTO property_visits (
       workspace_id, property_id, contact_id, conversation_id, assignee_id,
       scheduled_at, notes, created_by_ai
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      workspaceId, propertyId, contactId || null, conversationId || null, assigneeId || null,
      scheduledAt, notes || null, !!createdByAi,
    ]
  );

  const visit = await query(`${SELECT_BASE} WHERE v.id = $1`, [r.rows[0].id]);
  return visit.rows[0];
}

// ── Update ────────────────────────────────────────────────────────────────

const UPDATE_FIELD_MAP = {
  status:      'status',
  scheduledAt: 'scheduled_at',
  notes:       'notes',
  assigneeId:  'assignee_id',
};

async function update(visitId, workspaceId, body) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });
  fields.push(`updated_at = NOW()`);
  vals.push(visitId, workspaceId);

  const r = await query(
    `UPDATE property_visits SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING id`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Visita não encontrada'), { status: 404 });

  const visit = await query(`${SELECT_BASE} WHERE v.id = $1`, [visitId]);
  return visit.rows[0];
}

module.exports = { list, create, update };
