'use strict';

const axios        = require('axios');
const path         = require('path');
const { query }    = require('../../config/database');
const logger       = require('../../utils/logger');

// ── Listagem ──────────────────────────────────────────────────────────────────

async function list(workspaceId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const countRes = await query(
    'SELECT COUNT(*) FROM broadcasts WHERE workspace_id = $1',
    [workspaceId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const r = await query(
    `SELECT b.*,
            i.name AS inbox_name, i.channel_type,
            u.name AS created_by_name
     FROM broadcasts b
     JOIN inboxes i ON i.id = b.inbox_id
     JOIN users   u ON u.id = b.created_by
     WHERE b.workspace_id = $1
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [workspaceId, limit, offset]
  );
  return { data: r.rows, total, page, limit };
}

async function getById(broadcastId, workspaceId) {
  const r = await query(
    `SELECT b.*,
            i.name AS inbox_name, i.channel_type,
            u.name AS created_by_name
     FROM broadcasts b
     JOIN inboxes i ON i.id = b.inbox_id
     JOIN users   u ON u.id = b.created_by
     WHERE b.id = $1 AND b.workspace_id = $2`,
    [broadcastId, workspaceId]
  );
  return r.rows[0] || null;
}

async function getContacts(broadcastId, { page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const countRes = await query(
    'SELECT COUNT(*) FROM broadcast_contacts WHERE broadcast_id = $1',
    [broadcastId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const r = await query(
    `SELECT bc.*, c.name AS contact_name
     FROM broadcast_contacts bc
     JOIN contacts c ON c.id = bc.contact_id
     WHERE bc.broadcast_id = $1
     ORDER BY bc.created_at ASC
     LIMIT $2 OFFSET $3`,
    [broadcastId, limit, offset]
  );
  return { data: r.rows, total, page, limit };
}

// ── Criação ───────────────────────────────────────────────────────────────────

async function create(workspaceId, userId, body) {
  const {
    name, inboxId, messageType = 'text', content, mediaUrl,
    templateId, templateVars, scheduledAt, sendIntervalMs = 1000,
    contactIds, filterTags,
  } = body;

  if (!name)    throw Object.assign(new Error('name é obrigatório'), { status: 400 });
  if (!inboxId) throw Object.assign(new Error('inboxId é obrigatório'), { status: 400 });

  // Verifica que a inbox pertence ao workspace
  const inboxRes = await query(
    'SELECT id FROM inboxes WHERE id = $1 AND workspace_id = $2',
    [inboxId, workspaceId]
  );
  if (!inboxRes.rows.length) throw Object.assign(new Error('Inbox não encontrada'), { status: 404 });

  const bRes = await query(
    `INSERT INTO broadcasts
       (workspace_id, inbox_id, created_by, name, message_type, content, media_url,
        template_id, template_vars, scheduled_at, send_interval_ms, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft') RETURNING *`,
    [workspaceId, inboxId, userId, name, messageType, content || null, mediaUrl || null,
     templateId || null, templateVars ? JSON.stringify(templateVars) : '{}',
     scheduledAt || null, Math.max(500, sendIntervalMs)]
  );
  const broadcast = bRes.rows[0];

  // Resolve lista de contatos
  let resolvedContactIds = contactIds || [];

  if (filterTags?.length) {
    const tagRes = await query(
      `SELECT id FROM contacts WHERE workspace_id = $1 AND tags && $2::text[] AND phone IS NOT NULL`,
      [workspaceId, filterTags]
    );
    resolvedContactIds = [...new Set([...resolvedContactIds, ...tagRes.rows.map(r => r.id)])];
  }

  if (resolvedContactIds.length > 0) {
    await addContacts(broadcast.id, workspaceId, resolvedContactIds);
  }

  return broadcast;
}

async function addContacts(broadcastId, workspaceId, contactIds) {
  if (!contactIds.length) return;

  // Busca telefones dos contatos (apenas com telefone válido)
  const contactRes = await query(
    `SELECT id, phone FROM contacts
     WHERE id = ANY($1::uuid[]) AND workspace_id = $2 AND phone IS NOT NULL`,
    [contactIds, workspaceId]
  );

  if (!contactRes.rows.length) return;

  const values = contactRes.rows.map((c, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
  const params = contactRes.rows.flatMap(c => [broadcastId, c.id, c.phone]);

  await query(
    `INSERT INTO broadcast_contacts (broadcast_id, contact_id, phone)
     VALUES ${values}
     ON CONFLICT (broadcast_id, contact_id) DO NOTHING`,
    params
  );

  await query(
    `UPDATE broadcasts SET total_contacts = (
       SELECT COUNT(*) FROM broadcast_contacts WHERE broadcast_id = $1
     ) WHERE id = $1`,
    [broadcastId]
  );
}

// ── Envio ─────────────────────────────────────────────────────────────────────

async function start(broadcastId, workspaceId) {
  const broadcast = await getById(broadcastId, workspaceId);
  if (!broadcast) throw Object.assign(new Error('Broadcast não encontrado'), { status: 404 });
  if (!['draft', 'paused'].includes(broadcast.status)) {
    throw Object.assign(new Error(`Não é possível iniciar um broadcast com status "${broadcast.status}"`), { status: 400 });
  }

  await query(
    `UPDATE broadcasts SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = $1`,
    [broadcastId]
  );

  // Dispara o processamento em background sem bloquear a resposta HTTP
  processBroadcast(broadcastId, workspaceId).catch(err =>
    logger.error('Broadcast processing failed', { broadcastId, err: err.message })
  );

  return { ok: true, status: 'running' };
}

async function pause(broadcastId, workspaceId) {
  const r = await query(
    `UPDATE broadcasts SET status = 'paused' WHERE id = $1 AND workspace_id = $2 AND status = 'running' RETURNING *`,
    [broadcastId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Broadcast não está em execução'), { status: 400 });
  return r.rows[0];
}

async function cancel(broadcastId, workspaceId) {
  const r = await query(
    `UPDATE broadcasts SET status = 'cancelled', finished_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND status IN ('draft','scheduled','running','paused') RETURNING *`,
    [broadcastId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Broadcast não pode ser cancelado'), { status: 400 });
  // Marca contatos pendentes como skipped
  await query(
    `UPDATE broadcast_contacts SET status = 'skipped' WHERE broadcast_id = $1 AND status = 'pending'`,
    [broadcastId]
  );
  return r.rows[0];
}

async function remove(broadcastId, workspaceId) {
  const r = await query(
    `DELETE FROM broadcasts WHERE id = $1 AND workspace_id = $2 AND status IN ('draft','cancelled') RETURNING id`,
    [broadcastId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Só é possível excluir broadcasts em rascunho ou cancelados'), { status: 400 });
}

// ── Processamento em background ───────────────────────────────────────────────

async function processBroadcast(broadcastId, workspaceId) {
  const broadcastRes = await query(
    `SELECT b.*, i.channel_type, i.evolution_api_url, i.evolution_api_key, i.evolution_instance,
            i.waba_phone_number_id, i.waba_access_token
     FROM broadcasts b
     JOIN inboxes i ON i.id = b.inbox_id
     WHERE b.id = $1`,
    [broadcastId]
  );
  if (!broadcastRes.rows.length) return;
  const broadcast = broadcastRes.rows[0];

  // Processa em lotes de 50 contatos por vez
  while (true) {
    // Verifica se o broadcast ainda está rodando
    const statusRes = await query('SELECT status FROM broadcasts WHERE id = $1', [broadcastId]);
    if (!statusRes.rows.length || statusRes.rows[0].status !== 'running') break;

    const pendingRes = await query(
      `SELECT * FROM broadcast_contacts
       WHERE broadcast_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 50`,
      [broadcastId]
    );

    if (!pendingRes.rows.length) {
      // Todos enviados — marca como done
      await query(
        `UPDATE broadcasts SET status = 'done', finished_at = NOW() WHERE id = $1`,
        [broadcastId]
      );
      break;
    }

    for (const bc of pendingRes.rows) {
      // Re-verifica status a cada iteração para suportar pause
      const statusCheck = await query('SELECT status FROM broadcasts WHERE id = $1', [broadcastId]);
      if (!statusCheck.rows.length || statusCheck.rows[0].status !== 'running') return;

      await sendToBroadcastContact(broadcast, bc);

      // Rate limiting
      if (broadcast.send_interval_ms > 0) {
        await new Promise(resolve => setTimeout(resolve, broadcast.send_interval_ms));
      }
    }
  }
}

async function sendToBroadcastContact(broadcast, bc) {
  const { phone, id: bcId } = bc;

  try {
    let externalMsgId = null;

    if (broadcast.channel_type === 'whatsapp_official') {
      externalMsgId = await sendWaba(broadcast, phone);
    } else {
      externalMsgId = await sendEvolution(broadcast, phone);
    }

    await query(
      `UPDATE broadcast_contacts SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [bcId]
    );
    await query(
      `UPDATE broadcasts SET sent_count = sent_count + 1 WHERE id = $1`,
      [broadcast.id]
    );

    if (externalMsgId) {
      await query(
        `UPDATE broadcast_contacts SET message_id = (
           SELECT id FROM messages WHERE evolution_msg_id = $1 LIMIT 1
         ) WHERE id = $2`,
        [externalMsgId, bcId]
      );
    }
  } catch (err) {
    const errMsg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.error('Broadcast contact send failed', { bcId, phone, err: errMsg });
    await query(
      `UPDATE broadcast_contacts SET status = 'failed', error_message = $1 WHERE id = $2`,
      [errMsg?.slice(0, 500), bcId]
    );
    await query(
      `UPDATE broadcasts SET failed_count = failed_count + 1 WHERE id = $1`,
      [broadcast.id]
    );
  }
}

async function sendWaba(broadcast, phone) {
  const { waba_phone_number_id: phoneNumberId, waba_access_token: token } = broadcast;
  if (!phoneNumberId || !token) throw new Error('Inbox sem credenciais WABA');

  const url     = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let body;
  if (broadcast.message_type === 'template') {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: typeof broadcast.content === 'string'
        ? JSON.parse(broadcast.content)
        : broadcast.content,
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: broadcast.content, preview_url: false },
    };
  }

  const res = await axios.post(url, body, { headers, timeout: 15000 });
  return res?.data?.messages?.[0]?.id || null;
}

async function sendEvolution(broadcast, phone) {
  const { evolution_api_url: baseUrl, evolution_api_key: apiKey, evolution_instance: instance } = broadcast;
  if (!baseUrl || !instance) throw new Error('Inbox sem credenciais Evolution');

  const headers = { apikey: apiKey };
  let res;

  if (broadcast.message_type !== 'text' && broadcast.media_url) {
    const filename = path.basename(new URL(broadcast.media_url).pathname);
    const ext      = path.extname(filename).toLowerCase();
    const mimeMap  = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.pdf': 'application/pdf', '.mp4': 'video/mp4',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const storageSvc = require('../../services/storage.service');
    const buf    = await storageSvc.getFileBuffer(filename);
    const base64 = buf.toString('base64');

    res = await axios.post(
      `${baseUrl}/message/sendMedia/${instance}`,
      { number: phone, mediatype: broadcast.message_type, media: base64, mimetype: mime,
        caption: broadcast.content || '', fileName: filename },
      { headers, timeout: 30000 }
    );
  } else {
    res = await axios.post(
      `${baseUrl}/message/sendText/${instance}`,
      { number: phone, text: broadcast.content },
      { headers, timeout: 10000 }
    );
  }

  return res?.data?.key?.id || null;
}

// ── Templates WABA ────────────────────────────────────────────────────────────

async function listTemplates(workspaceId, inboxId) {
  const r = await query(
    `SELECT * FROM waba_templates
     WHERE workspace_id = $1 AND inbox_id = $2
     ORDER BY name`,
    [workspaceId, inboxId]
  );
  return r.rows;
}

async function syncTemplates(workspaceId, inboxId) {
  const inboxRes = await query(
    'SELECT waba_phone_number_id, waba_access_token, waba_business_id FROM inboxes WHERE id = $1 AND workspace_id = $2',
    [inboxId, workspaceId]
  );
  if (!inboxRes.rows.length) throw Object.assign(new Error('Inbox não encontrada'), { status: 404 });
  const { waba_access_token: token, waba_business_id: businessId } = inboxRes.rows[0];
  if (!token || !businessId) throw Object.assign(new Error('Inbox sem credenciais WABA completas'), { status: 400 });

  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${businessId}/message_templates?limit=100`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );

  const templates = res?.data?.data || [];
  const synced    = [];

  for (const t of templates) {
    const r = await query(
      `INSERT INTO waba_templates
         (workspace_id, inbox_id, name, display_name, category, language, status, components, meta_template_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (inbox_id, name, language) DO UPDATE SET
         status = EXCLUDED.status,
         components = EXCLUDED.components,
         meta_template_id = EXCLUDED.meta_template_id,
         updated_at = NOW()
       RETURNING *`,
      [workspaceId, inboxId, t.name, t.name, t.category, t.language,
       t.status, JSON.stringify(t.components || []), t.id]
    );
    synced.push(r.rows[0]);
  }

  return synced;
}

module.exports = {
  list, getById, getContacts,
  create, addContacts,
  start, pause, cancel, remove,
  listTemplates, syncTemplates,
};
