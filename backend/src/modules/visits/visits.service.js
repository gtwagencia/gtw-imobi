'use strict';

const { query } = require('../../config/database');
const gcal      = require('../../services/google-calendar.service');
const nps       = require('../nps/nps.service');

const SELECT_BASE = `
  SELECT v.*,
         p.code  AS property_code,
         p.title AS property_title,
         (SELECT pm.url FROM property_media pm
           WHERE pm.property_id = p.id AND pm.is_cover = true LIMIT 1) AS property_cover_url,
         ct.name  AS contact_name,
         ct.phone AS contact_phone,
         u.name   AS assignee_name,
         EXISTS (
           SELECT 1 FROM property_visit_google_events pvge
           WHERE pvge.visit_id = v.id AND pvge.user_id = v.assignee_id
         ) AS google_synced
  FROM property_visits v
  JOIN properties p       ON p.id = v.property_id
  LEFT JOIN contacts ct   ON ct.id = v.contact_id
  LEFT JOIN users u       ON u.id = v.assignee_id
`;

function visitEventPayload(visit) {
  return {
    title:         `${visit.property_code} · ${visit.property_title}`,
    contactName:   visit.contact_name,
    contactPhone:  visit.contact_phone,
    propertyCode:  visit.property_code,
    propertyTitle: visit.property_title,
    notes:         visit.notes,
    scheduledAt:   visit.scheduled_at,
  };
}

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
  const created = visit.rows[0];

  // Sincroniza com o Google Calendar do corretor responsável, em background
  if (created.assignee_id && created.status !== 'cancelada') {
    gcal.createVisitEvent(created.assignee_id, created.id, visitEventPayload(created))
      .catch(err => console.error('[gcal-sync] createVisit:', err.message));
  }

  return created;
}

// ── Update ────────────────────────────────────────────────────────────────

const UPDATE_FIELD_MAP = {
  status:      'status',
  scheduledAt: 'scheduled_at',
  notes:       'notes',
  assigneeId:  'assignee_id',
};

async function update(visitId, workspaceId, body) {
  const prevR = await query(
    'SELECT assignee_id, status FROM property_visits WHERE id = $1 AND workspace_id = $2',
    [visitId, workspaceId]
  );
  if (!prevR.rows.length) throw Object.assign(new Error('Visita não encontrada'), { status: 404 });
  const prev = prevR.rows[0];

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

  const visit   = await query(`${SELECT_BASE} WHERE v.id = $1`, [visitId]);
  const updated = visit.rows[0];

  // ── Sincroniza com o Google Calendar do corretor responsável ─────────────
  const newAssigneeId = 'assigneeId' in body ? (body.assigneeId || null) : prev.assignee_id;
  const newStatus     = 'status'     in body ? body.status              : prev.status;

  const assigneeChanged = 'assigneeId' in body && body.assigneeId !== prev.assignee_id;
  const scheduleChanged = 'scheduledAt' in body;
  const becameCancelled = newStatus === 'cancelada' && prev.status !== 'cancelada';
  const becameActive    = prev.status === 'cancelada' && newStatus !== 'cancelada';

  if (assigneeChanged) {
    if (prev.assignee_id) {
      gcal.deleteVisitEvent(prev.assignee_id, visitId)
        .catch(err => console.error('[gcal-sync] deleteVisitEvent (old assignee):', err.message));
    }
    if (newAssigneeId && newStatus !== 'cancelada') {
      gcal.createVisitEvent(newAssigneeId, visitId, visitEventPayload(updated))
        .catch(err => console.error('[gcal-sync] createVisitEvent (new assignee):', err.message));
    }
  } else if (becameCancelled && newAssigneeId) {
    gcal.deleteVisitEvent(newAssigneeId, visitId)
      .catch(err => console.error('[gcal-sync] deleteVisitEvent (cancelada):', err.message));
  } else if (becameActive && newAssigneeId) {
    gcal.createVisitEvent(newAssigneeId, visitId, visitEventPayload(updated))
      .catch(err => console.error('[gcal-sync] createVisitEvent (reativada):', err.message));
  } else if (scheduleChanged && newAssigneeId && newStatus !== 'cancelada') {
    gcal.updateVisitEvent(newAssigneeId, visitId, visitEventPayload(updated))
      .catch(err => console.error('[gcal-sync] updateVisitEvent:', err.message));
  }

  // ── NPS: disparar pesquisa quando visita for marcada como realizada ──────
  const becameRealizada   = newStatus === 'realizada'   && prev.status !== 'realizada';
  const becameConfirmada  = newStatus === 'confirmada'  && prev.status !== 'confirmada';

  if (becameRealizada) {
    nps.sendNpsAfterVisit(workspaceId, visitId)
      .catch(err => console.error('[nps] sendNpsAfterVisit:', err.message));
  }

  // ── Confirmação automática via WhatsApp ─────────────────────────────────
  if (becameConfirmada && updated.conversation_id) {
    ;(async () => {
      try {
        const msgSvc = require('../messages/messages.service');
        const dt = updated.scheduled_at
          ? new Date(updated.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '(horário a confirmar)';
        const text = `✅ *Visita confirmada!*\n\n🏠 Imóvel: ${updated.property_title || updated.property_code || ''}\n📅 Data/Hora: ${dt}\n\nAguardamos você! Qualquer dúvida, é só chamar. 😊`;
        await msgSvc.send(updated.conversation_id, null, { content: text, messageType: 'text' });
      } catch (err) {
        console.error('[visit-confirm] WhatsApp send failed:', err.message);
      }
    })();
  }

  return updated;
}

module.exports = { list, create, update };
