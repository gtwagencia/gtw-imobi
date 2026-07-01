'use strict';

const axios     = require('axios');
const { query } = require('../../config/database');
const logger     = require('../../utils/logger');

const PRAEDIUM_API_BASE = 'https://api.praedium.com.br/v1';

// ── Config ────────────────────────────────────────────────────────────────

async function getConfig(workspaceId) {
  const r = await query('SELECT * FROM praedium_integrations WHERE workspace_id = $1', [workspaceId]);
  return r.rows[0] || null;
}

async function saveConfig(workspaceId, body) {
  const map = {
    enabled:                'enabled',
    clientCode:              'client_code',
    connectionSlug:           'connection_slug',
    accessToken:              'access_token',
    observationFieldSlug:     'observation_field_slug',
    qualifiedLeadStage:       'qualified_lead_stage',
    inboundEnabled:           'inbound_enabled',
    proactiveInboxId:         'proactive_inbox_id',
    proactiveTemplateName:    'proactive_template_name',
  };

  const cols = [];
  const vals = [];
  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (body[jsKey] === undefined) continue;
    cols.push(dbCol);
    vals.push(body[jsKey]);
  }

  const existing = await getConfig(workspaceId);
  if (!existing) {
    cols.push('workspace_id');
    vals.push(workspaceId);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const r = await query(
      `INSERT INTO praedium_integrations (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return r.rows[0];
  }

  if (!cols.length) return existing;
  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  vals.push(workspaceId);
  const r = await query(
    `UPDATE praedium_integrations SET ${setClause} WHERE workspace_id = $${vals.length} RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function regenerateInboundToken(workspaceId) {
  const r = await query(
    `UPDATE praedium_integrations
     SET inbound_token = encode(gen_random_bytes(24), 'hex')
     WHERE workspace_id = $1 RETURNING *`,
    [workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Integração Praedium não configurada'), { status: 404 });
  return r.rows[0];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function splitName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { name: null, surname: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { name: parts[0], surname: null };
  return { name: parts[0], surname: parts.slice(1).join(' ') };
}

/** Último imóvel ofertado no deal (com property_code), ou o property_id do próprio deal. */
async function resolveOfferedPropertyCode(dealId) {
  if (!dealId) return null;

  const kanbanSvc = require('../kanban/kanban.service');
  const items = await kanbanSvc.getOfferedItems(dealId);
  const lastPropertyOffer = [...items].reverse().find(i => i.property_code);
  if (lastPropertyOffer) return lastPropertyOffer.property_code;

  const dealRes = await query('SELECT property_id FROM deals WHERE id = $1', [dealId]);
  const propertyId = dealRes.rows[0]?.property_id;
  if (!propertyId) return null;

  const propRes = await query('SELECT code FROM properties WHERE id = $1', [propertyId]);
  return propRes.rows[0]?.code || null;
}

// ── Envio (Recebimento de Leads do Praedium) ─────────────────────────────────

async function sendLead(workspaceId, { contactId, propertyCode, summary, leadStage }) {
  const cfg = await getConfig(workspaceId);
  if (!cfg?.enabled) {
    throw Object.assign(new Error('Integração Praedium desativada neste workspace'), { status: 400 });
  }
  if (!cfg.client_code || !cfg.connection_slug || !cfg.access_token) {
    throw Object.assign(new Error('Integração Praedium incompleta — configure código da conta, conexão e token'), { status: 400 });
  }

  const contactRes = await query('SELECT name, phone, email FROM contacts WHERE id = $1 AND workspace_id = $2', [contactId, workspaceId]);
  const contact = contactRes.rows[0];
  if (!contact) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
  if (!contact.phone && !contact.email) {
    throw Object.assign(new Error('Contato sem telefone ou e-mail — obrigatório para o Praedium'), { status: 400 });
  }

  const { name, surname } = splitName(contact.name);
  const payload = {
    name: name || contact.phone || 'Lead',
    surname: surname || undefined,
    primary_email: contact.email || undefined,
    first_phone: contact.phone || undefined,
    property_code: propertyCode || undefined,
    lead_stage: leadStage || cfg.qualified_lead_stage || undefined,
  };
  if (cfg.observation_field_slug && summary) {
    payload[cfg.observation_field_slug] = summary;
  }
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const url = `${PRAEDIUM_API_BASE}/${cfg.client_code}/${cfg.connection_slug}/conversion`;

  try {
    const resp = await axios.post(url, payload, {
      params: { access_token: cfg.access_token },
      timeout: 15000,
    });
    await query(
      `UPDATE praedium_integrations
       SET last_sent_at = NOW(), last_send_result = $1, last_send_error = NULL
       WHERE workspace_id = $2`,
      [JSON.stringify({ uuid: resp.data?.uuid, code: resp.data?.code }), workspaceId]
    );
    return resp.data;
  } catch (err) {
    const errBody = err.response?.data?.error || err.message;
    await query(
      `UPDATE praedium_integrations SET last_send_error = $1 WHERE workspace_id = $2`,
      [String(errBody).slice(0, 500), workspaceId]
    );
    logger.warn('[praedium] Falha ao enviar lead', { workspaceId, err: errBody });
    throw Object.assign(new Error(`Falha ao enviar lead ao Praedium: ${errBody}`), { status: 502 });
  }
}

/**
 * Chamada pela IA (ai.service.js) quando decide que o atendimento está pronto
 * para um humano. Em vez de rotear internamente, envia o lead pro Praedium e
 * encerra a conversa no Imobi360 — a gestão do funil segue lá.
 */
async function handleQualifiedHandoff(ctx, input) {
  const dealRes = await query('SELECT id, property_id FROM deals WHERE conversation_id = $1', [ctx.conversationId]);
  const dealId = dealRes.rows[0]?.id || null;

  const summary = input?.resumo?.trim() || input?.notas_atendimento?.trim() || null;
  const propertyCode = await resolveOfferedPropertyCode(dealId);

  const result = await sendLead(ctx.workspaceId, {
    contactId: ctx.contactId,
    propertyCode,
    summary,
  });

  await query(
    `UPDATE conversations SET bot_handoff_summary = $1, status = 'resolved', bot_active = false WHERE id = $2`,
    [summary, ctx.conversationId]
  );
  const payload = { conversationId: ctx.conversationId, status: 'resolved', botActive: false, botHandoffSummary: summary };
  ctx.io?.to(`ws:${ctx.workspaceId}`).emit('conversation:updated', payload);
  ctx.io?.to(`conv:${ctx.conversationId}`).emit('conversation:updated', payload);

  return { success: true, sentToPraedium: true, praediumUuid: result?.uuid || null };
}

// ── Recebimento (Envio de dados do Praedium) ─────────────────────────────────

function extractContactPayload(eventBody) {
  return eventBody?.contact || eventBody?.deal?.contact || null;
}

async function handleInboundEvent(workspaceId, eventBody) {
  const eventType = eventBody?.event_type || '';
  if (!eventType.startsWith('app.contacts.') && !eventType.startsWith('app.deals.')) {
    return { ok: false, reason: 'evento desconhecido' };
  }

  const raw = extractContactPayload(eventBody);
  let contact = null;
  if (raw && (raw.name || raw.primary_email || raw.first_phone)) {
    const contactsSvc = require('../contacts/contacts.service');
    const fullName = [raw.name, raw.surname].filter(Boolean).join(' ') || 'Lead Praedium';
    contact = await contactsSvc.create(workspaceId, {
      name: fullName,
      phone: raw.first_phone || null,
      email: raw.primary_email || null,
      tags: ['Praedium'],
    });
  }

  await query(
    `UPDATE praedium_integrations
     SET last_received_at = NOW(), last_receive_result = $1, last_receive_error = NULL
     WHERE workspace_id = $2`,
    [JSON.stringify({ eventType, contactId: contact?.id || null }), workspaceId]
  );

  const isNewLeadEvent = eventType === 'app.contacts.created' || eventType === 'app.deals.created';
  if (isNewLeadEvent && contact?.phone) {
    const cfg = await getConfig(workspaceId);
    if (cfg?.inbound_enabled && cfg.proactive_inbox_id && cfg.proactive_template_name) {
      const broadcastsSvc = require('../broadcasts/broadcasts.service');
      broadcastsSvc.sendTemplateToContact(workspaceId, {
        inboxId: cfg.proactive_inbox_id,
        contactId: contact.id,
        templateName: cfg.proactive_template_name,
      }).catch(err => {
        logger.warn('[praedium] Falha ao iniciar conversa proativa', { workspaceId, contactId: contact.id, err: err.message });
        query(
          `UPDATE praedium_integrations SET last_receive_error = $1 WHERE workspace_id = $2`,
          [`Conversa proativa falhou: ${err.message}`.slice(0, 500), workspaceId]
        ).catch(() => {});
      });
    }
  }

  return { ok: true, contactId: contact?.id || null };
}

module.exports = {
  getConfig, saveConfig, regenerateInboundToken,
  sendLead, resolveOfferedPropertyCode, handleQualifiedHandoff,
  handleInboundEvent,
};
