'use strict';

/**
 * Evolution API webhook receiver.
 * Each inbox must point to: POST /api/v1/webhooks/evolution/:inboxId
 */

const { Router }     = require('express');
const crypto         = require('crypto');
const axios          = require('axios');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../../config/database');
const contactSvc     = require('../contacts/contacts.service');
const convSvc        = require('../conversations/conversations.service');
const msgSvc         = require('../messages/messages.service');
const kanbanSvc      = require('../kanban/kanban.service');
const aiSvc          = require('../../services/ai.service');
const logger         = require('../../utils/logger');
const storageSvc     = require('../../services/storage.service');

const router = Router();

const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'video/mp4':  '.mp4', 'video/webm': '.webm',
  'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/webm': '.weba',
  'application/pdf': '.pdf',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(jid) {
  return jid?.replace(/@.+$/, '').replace(/\D/g, '') || null;
}

/**
 * Normaliza MIME type removendo parâmetros (ex: "audio/ogg; codecs=opus" → "audio/ogg").
 */
function cleanMime(mimeType) {
  return (mimeType || '').split(';')[0].trim() || 'application/octet-stream';
}

/**
 * Salva mídia no storage e retorna URL permanente.
 * 1. Usa base64 do webhook (quando WEBHOOK_BASE64=true na Evolution API)
 * 2. Se não vier base64, baixa diretamente da Evolution API
 * 3. Fallback para URL do CDN do WhatsApp (temporária)
 */
async function resolveMediaUrl(base64, mimeType, fallbackUrl, inbox, msgKey) {
  const mime     = cleanMime(mimeType);
  const ext      = MIME_EXT[mime] || '.bin';
  const filename = `${uuidv4()}${ext}`;

  // 1. base64 veio no webhook
  if (base64) {
    try {
      const raw = base64.replace(/^data:[^;]+;base64,/, '');
      return await storageSvc.uploadFile(Buffer.from(raw, 'base64'), filename, mime);
    } catch (err) {
      logger.warn('Failed to save inbound media from base64', { err: err.message });
    }
  }

  // 2. Baixar via Evolution API
  if (inbox?.evolution_api_url && inbox?.evolution_instance && msgKey) {
    try {
      const resp = await axios.post(
        `${inbox.evolution_api_url}/chat/getBase64FromMediaMessage/${inbox.evolution_instance}`,
        { message: { key: msgKey } },
        { headers: { apikey: inbox.evolution_api_key }, timeout: 20000 }
      );
      const dlBase64 = resp.data?.base64 || resp.data?.data?.base64;
      if (dlBase64) {
        const raw = dlBase64.replace(/^data:[^;]+;base64,/, '');
        return await storageSvc.uploadFile(Buffer.from(raw, 'base64'), filename, mime);
      }
    } catch (err) {
      logger.warn('Failed to download media from Evolution API', { err: err.message });
    }
  }

  return fallbackUrl || null;
}

async function extractMessageContent(msg, inbox) {
  // Evolution API envia base64 em msg.base64 quando WEBHOOK_BASE64=true
  const b64 = msg.base64 || null;
  const key = msg.key || null;

  if (msg.message?.conversation)
    return { content: msg.message.conversation, messageType: 'text' };

  if (msg.message?.extendedTextMessage?.text)
    return { content: msg.message.extendedTextMessage.text, messageType: 'text' };

  if (msg.message?.imageMessage) {
    const m = msg.message.imageMessage;
    return {
      content:      m.caption || '',
      messageType:  'image',
      mediaUrl:     await resolveMediaUrl(b64, m.mimetype || 'image/jpeg', m.url, inbox, key),
      mediaMimeType: cleanMime(m.mimetype || 'image/jpeg'),
    };
  }
  if (msg.message?.videoMessage) {
    const m = msg.message.videoMessage;
    return {
      content:      m.caption || '',
      messageType:  'video',
      mediaUrl:     await resolveMediaUrl(b64, m.mimetype || 'video/mp4', m.url, inbox, key),
      mediaMimeType: cleanMime(m.mimetype || 'video/mp4'),
    };
  }
  if (msg.message?.audioMessage) {
    const m = msg.message.audioMessage;
    return {
      content:      '',
      messageType:  'audio',
      mediaUrl:     await resolveMediaUrl(b64, m.mimetype || 'audio/ogg', m.url, inbox, key),
      mediaMimeType: cleanMime(m.mimetype || 'audio/ogg'),
    };
  }
  if (msg.message?.documentMessage) {
    const m = msg.message.documentMessage;
    return {
      content:      m.fileName || '',
      messageType:  'document',
      mediaUrl:     await resolveMediaUrl(b64, m.mimetype || 'application/octet-stream', m.url, inbox, key),
      mediaMimeType: cleanMime(m.mimetype || 'application/octet-stream'),
    };
  }
  if (msg.message?.stickerMessage) {
    const m = msg.message.stickerMessage;
    return {
      content:      '',
      messageType:  'sticker',
      mediaUrl:     await resolveMediaUrl(b64, m.mimetype || 'image/webp', m.url, inbox, key),
      mediaMimeType: cleanMime(m.mimetype || 'image/webp'),
    };
  }

  // Reação a mensagem
  if (msg.message?.reactionMessage) {
    const emoji = msg.message.reactionMessage.text || '👍';
    return { content: emoji, messageType: 'reaction' };
  }

  // Localização
  if (msg.message?.locationMessage) {
    const m = msg.message.locationMessage;
    const lat = m.degreesLatitude;
    const lng = m.degreesLongitude;
    const label = m.name ? `📍 ${m.name}` : '📍 Localização compartilhada';
    return {
      content:     `${label}\nhttps://www.google.com/maps?q=${lat},${lng}`,
      messageType: 'location',
    };
  }

  // Contato(s) compartilhado(s)
  if (msg.message?.contactMessage) {
    const name = msg.message.contactMessage.displayName || 'Contato';
    return { content: `👤 Contato: ${name}`, messageType: 'contact' };
  }
  if (msg.message?.contactsArrayMessage) {
    const names = (msg.message.contactsArrayMessage.contacts || [])
      .map(c => c.displayName).filter(Boolean).join(', ');
    return { content: `👥 Contatos: ${names || 'compartilhados'}`, messageType: 'contact' };
  }

  // Enquete / Poll
  if (msg.message?.pollCreationMessage) {
    const poll = msg.message.pollCreationMessage;
    const opts = (poll.options || []).map(o => `• ${o.optionName}`).join('\n');
    return { content: `📊 ${poll.name}\n${opts}`, messageType: 'poll' };
  }

  // Mensagem de lista (botões)
  if (msg.message?.listMessage) {
    const m = msg.message.listMessage;
    return { content: m.description || m.title || '📋 Mensagem de lista', messageType: 'text' };
  }

  // Mensagem com botões (buttonsMessage)
  if (msg.message?.buttonsMessage) {
    const m = msg.message.buttonsMessage;
    const parts = [];
    if (m.contentText)  parts.push(m.contentText);
    if (m.footerText)   parts.push(`_${m.footerText}_`);
    const btns = (m.buttons || [])
      .map(b => b.buttonText?.displayText).filter(Boolean);
    if (btns.length) parts.push(`[${btns.join('] [')}]`);
    return { content: parts.join('\n') || '🔘 Mensagem com botões', messageType: 'text' };
  }

  // Template message (eco de template enviado / resposta a template)
  if (msg.message?.templateMessage) {
    const h = msg.message.templateMessage?.hydratedTemplate;
    const parts = [];
    if (h?.hydratedTitleText)   parts.push(h.hydratedTitleText);
    if (h?.hydratedContentText) parts.push(h.hydratedContentText);
    if (h?.hydratedFooterText)  parts.push(`_${h.hydratedFooterText}_`);
    const btns = (h?.hydratedButtons || []).map(b => {
      if (b.quickReplyButton) return b.quickReplyButton.displayText;
      if (b.urlButton)        return `${b.urlButton.displayText} 🔗`;
      if (b.callButton)       return `${b.callButton.displayText} 📞`;
      return null;
    }).filter(Boolean);
    if (btns.length) parts.push(`[${btns.join('] [')}]`);
    // fallback: nome do template se nada for extraído
    const templateName = msg.message.templateMessage?.name;
    return {
      content: parts.join('\n') || (templateName ? `[Template: ${templateName}]` : '🔘 Mensagem de template'),
      messageType: 'text',
    };
  }

  // Interactive message (API oficial — botões e listas interativas)
  if (msg.message?.interactiveMessage) {
    const m = msg.message.interactiveMessage;
    const parts = [];
    const headerText = m.header?.text || m.header?.imageMessage?.caption;
    if (headerText)   parts.push(headerText);
    if (m.body?.text) parts.push(m.body.text);
    if (m.footer?.text) parts.push(`_${m.footer.text}_`);
    // botões inline
    const btns = (m.nativeFlowMessage?.buttons || m.buttonsMessage?.buttons || [])
      .map(b => b.buttonText?.displayText || b.name).filter(Boolean);
    if (btns.length) parts.push(`[${btns.join('] [')}]`);
    return { content: parts.join('\n') || '🔘 Mensagem interativa', messageType: 'text' };
  }

  // Mensagem revogada / apagada
  if (msg.message?.protocolMessage?.type === 0) {
    return { content: '🚫 Mensagem apagada', messageType: 'deleted' };
  }

  // Ephemeral / view-once: desempacota o conteúdo real
  const inner = msg.message?.ephemeralMessage?.message
    || msg.message?.viewOnceMessage?.message
    || msg.message?.viewOnceMessageV2?.message;
  if (inner) {
    return extractMessageContent({ ...msg, message: inner }, inbox);
  }

  // Tipo desconhecido: mostra o nome do tipo para facilitar diagnóstico
  const knownKey = Object.keys(msg.message || {}).find(k => k.endsWith('Message') || k.endsWith('Action'));
  const typeName = knownKey ? knownKey.replace('Message', '').replace(/([A-Z])/g, ' $1').trim() : 'desconhecido';
  return { content: `[${typeName}]`, messageType: 'unsupported' };
}

/**
 * Processa mensagens de grupos WhatsApp.
 * - Cria/atualiza um contato para o grupo
 * - Cria/reutiliza uma conversa is_group=true por inbox+group
 * - Armazena sender_jid e sender_name de cada mensagem
 */
async function handleGroupMessage(msg, inbox, io, event) {
  try {
    const remoteJid  = msg.key?.remoteJid;                        // ex: 123456@g.us
    const isFromMe   = !!msg.key?.fromMe;
    const senderJid  = msg.key?.participant || msg.participant || (isFromMe ? 'me' : null);
    const senderName = msg.pushName || normalizePhone(senderJid) || 'Desconhecido';
    const groupPhone = normalizePhone(remoteJid);                  // só os dígitos do ID do grupo

    // Nome do grupo — tenta várias fontes, nunca usa pushName (é o remetente)
    let groupName = event?.data?.name
      || event?.data?.subject
      || msg.message?.groupInviteMessage?.groupName;

    // Se ainda não tem nome, busca na Evolution API
    if (!groupName && inbox.evolution_api_url && inbox.evolution_api_key && inbox.evolution_instance) {
      try {
        const resp = await axios.get(
          `${inbox.evolution_api_url}/group/findGroupInfos/${inbox.evolution_instance}`,
          {
            params:  { groupJid: remoteJid },
            headers: { apikey: inbox.evolution_api_key },
            timeout: 5000,
          }
        );
        groupName = resp.data?.subject || resp.data?.name || null;
      } catch {
        // silently ignore — usa o fallback abaixo
      }
    }

    groupName = groupName || `Grupo ${groupPhone}`;

    // Upsert contato-grupo
    let contact;
    try {
      contact = await contactSvc.create(inbox.workspace_id, { name: groupName, phone: groupPhone });
    } catch {
      const r = await query(
        'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
        [inbox.workspace_id, groupPhone]
      );
      contact = r.rows[0];
    }
    if (!contact) return;

    // Conversa única por grupo (is_group=true, group_jid)
    let conversation;
    const convRes = await query(
      `SELECT * FROM conversations WHERE inbox_id = $1 AND group_jid = $2 LIMIT 1`,
      [inbox.id, remoteJid]
    );
    if (convRes.rows.length) {
      conversation = convRes.rows[0];
    } else {
      const newConv = await query(
        `INSERT INTO conversations
           (workspace_id, inbox_id, contact_id, remote_jid, group_jid, is_group, status)
         VALUES ($1, $2, $3, $4, $5, true, 'open')
         RETURNING *`,
        [inbox.workspace_id, inbox.id, contact.id, remoteJid, remoteJid]
      );
      conversation = newConv.rows[0];
    }

    const { content, messageType, mediaUrl, mediaMimeType } = await extractMessageContent(msg, inbox);
    const direction = isFromMe ? 'outbound' : 'inbound';

    // Insere a mensagem com sender_jid e sender_name
    const msgRes = await query(
      `INSERT INTO messages
         (conversation_id, direction, content, message_type, media_url, media_mime_type,
          evolution_msg_id, sender_jid, sender_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (evolution_msg_id) DO NOTHING
       RETURNING *`,
      [
        conversation.id, direction, content, messageType,
        mediaUrl || null, mediaMimeType || null,
        msg.key?.id || null, senderJid || null, senderName,
      ]
    );
    if (!msgRes.rows.length) return; // duplicata

    const message = msgRes.rows[0];
    await convSvc.refreshLastMessage(conversation.id, direction);
    await query('UPDATE conversations SET last_inbound_at = NOW() WHERE id = $1', [conversation.id]);

    // Atualiza nome do grupo se mudou
    if (groupName && groupName !== contact.name) {
      await query('UPDATE contacts SET name = $1 WHERE id = $2', [groupName, contact.id]);
    }

    io?.to(`conv:${conversation.id}`).emit('message:new', { ...message, is_group: true, contact_name: groupName });
    io?.to(`ws:${inbox.workspace_id}`).emit('message:new', { ...message, is_group: true, contact_name: groupName });
    io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
      conversationId:  conversation.id,
      lastMessageAt:   new Date(),
      lastMessageText: content,
      unreadCount:     direction === 'inbound' ? 1 : 0,
      isGroup:         true,
    });

    // Se a conversa de grupo é nova, avisa o frontend para recarregar a lista
    if (!convRes.rows.length) {
      io?.to(`ws:${inbox.workspace_id}`).emit('conversation:new', {
        conversationId: conversation.id,
        contactName:    groupName,
        isGroup:        true,
      });
    }
  } catch (err) {
    logger.error('Erro ao processar mensagem de grupo', { err: err.message });
  }
}

/**
 * Round-robin auto-assign: pick agent in the department with fewest open conversations.
 */
/**
 * Round-robin: seleciona o agente com menos conversas abertas dentre
 * os que pertencem ao inbox. Se o inbox não tiver membros vinculados,
 * cai no pool do departamento (se houver). Se ainda assim não encontrar,
 * retorna null — NÃO atribui a um agente aleatório de outro inbox.
 */
async function autoAssignAgent(workspaceId, inboxId, departmentId) {
  // 1. Tenta agentes vinculados especificamente a este inbox
  if (inboxId) {
    const r = await query(
      `SELECT im.user_id,
              COUNT(c.id)::int AS open_count
       FROM inbox_memberships im
       JOIN workspace_memberships wm ON wm.user_id = im.user_id AND wm.workspace_id = $1
       LEFT JOIN conversations c
         ON c.assignee_id = im.user_id
         AND c.workspace_id = $1
         AND c.status = 'open'
       WHERE im.inbox_id = $2
         AND wm.role IN ('agent','admin','member')
       GROUP BY im.user_id
       ORDER BY open_count ASC, RANDOM()
       LIMIT 1`,
      [workspaceId, inboxId]
    );
    if (r.rows.length) return r.rows[0].user_id;

    // Inbox tem membros definidos mas nenhum disponível → não atribui
    // (verificar se o inbox realmente tem membros configurados)
    const memberCount = await query(
      'SELECT COUNT(*) FROM inbox_memberships WHERE inbox_id = $1',
      [inboxId]
    );
    if (parseInt(memberCount.rows[0].count, 10) > 0) {
      // Inbox tem membros mas todos estão ocupados → retorna null,
      // não atribui para agente de outro inbox
      return null;
    }
  }

  // 2. Sem membros de inbox configurados: tenta departamento
  if (departmentId) {
    const r = await query(
      `SELECT wm.user_id,
              COUNT(c.id)::int AS open_count
       FROM workspace_memberships wm
       LEFT JOIN conversations c
         ON c.assignee_id = wm.user_id
         AND c.workspace_id = $1
         AND c.status = 'open'
       WHERE wm.workspace_id = $1
         AND wm.role IN ('agent','member')
         AND wm.department_id = $2
       GROUP BY wm.user_id
       ORDER BY open_count ASC, RANDOM()
       LIMIT 1`,
      [workspaceId, departmentId]
    );
    if (r.rows.length) return r.rows[0].user_id;
  }

  // 3. Nenhuma regra específica → não atribui automaticamente
  return null;
}

// ── Main webhook endpoint ──────────────────────────────────────────────────

router.post('/evolution/:inboxId', async (req, res) => {
  const { inboxId } = req.params;
  const event = req.body;

  // Responde imediatamente para a Evolution API não retentar
  // O processamento continua assincronamente abaixo
  res.json({ ok: true });

  try {
    const inboxRes = await query('SELECT * FROM inboxes WHERE id = $1', [inboxId]);
    if (!inboxRes.rows.length) return;
    const inbox = inboxRes.rows[0];

    // Validação HMAC opcional — apenas loga e ignora se inválida (já respondemos 200)
    if (inbox.hmac_enabled && inbox.webhook_secret) {
      const signature = req.headers['x-hub-signature-256'] || req.headers['x-webhook-hmac'];
      if (!signature) {
        logger.warn('Webhook HMAC ausente (ignorado)', { inboxId });
        return;
      }
      const rawBody  = JSON.stringify(req.body);
      const expected = 'sha256=' + crypto.createHmac('sha256', inbox.webhook_secret).update(rawBody).digest('hex');
      const sigBuf   = Buffer.from(signature);
      const expBuf   = Buffer.from(expected);
      const valid    = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
      if (!valid) {
        logger.warn('Webhook HMAC inválido (ignorado)', { inboxId });
        return;
      }
    }

    const io    = req.app.get('io');

    const eventType = event.event || event.type;

    // ── CONNECTION_UPDATE ────────────────────────────────────────────────
    if (eventType === 'CONNECTION_UPDATE' || eventType === 'connection.update') {
      const state  = event.data?.state || event.state;
      const qrCode = event.data?.qrcode?.base64 || null;
      const statusMap = { open: 'connected', close: 'disconnected', connecting: 'connecting' };

      await query(
        `UPDATE inboxes SET connection_status = $1, qr_code = $2, updated_at = NOW() WHERE id = $3`,
        [statusMap[state] || 'disconnected', qrCode, inboxId]
      );
      io?.to(`ws:${inbox.workspace_id}`).emit('inbox:status', {
        inboxId, connectionStatus: statusMap[state] || 'disconnected', qrCode,
      });
      return;
    }

    // ── MESSAGES_UPDATE ──────────────────────────────────────────────────
    if (eventType === 'MESSAGES_UPDATE' || eventType === 'messages.update') {
      const updates = Array.isArray(event.data) ? event.data : [event.data];
      for (const upd of updates) {
        if (!upd?.key?.id) continue;
        const statusMap = { 2: 'delivered', 3: 'read', 4: 'read' };
        const newStatus = statusMap[upd.update?.status];
        if (!newStatus) continue;

        await query('UPDATE messages SET status = $1 WHERE evolution_msg_id = $2', [newStatus, upd.key.id]);
        io?.emit('message:status', { evolutionMsgId: upd.key.id, status: newStatus });
      }
      return;
    }

    // ── GROUPS_UPSERT — atualiza nome do grupo quando a Evolution envia metadados ──
    if (eventType === 'GROUPS_UPSERT' || eventType === 'groups.upsert') {
      const groups = Array.isArray(event.data) ? event.data : [event.data];
      for (const group of groups) {
        const groupJid  = group?.id;
        const groupName = group?.subject || group?.name;
        if (!groupJid || !groupName) continue;

        const groupPhone = normalizePhone(groupJid);

        // Atualiza o nome do contato-grupo se já existir
        await query(
          `UPDATE contacts SET name = $1, updated_at = NOW()
           WHERE workspace_id = $2 AND phone = $3`,
          [groupName, inbox.workspace_id, groupPhone]
        );

        // Atualiza o nome na conversa também (last_message_text não, mas o contato reflete no frontend)
        logger.info('[webhook] grupo atualizado', { groupJid, groupName });
      }
      return;
    }

    // ── MESSAGES_UPSERT ──────────────────────────────────────────────────
    if (eventType === 'MESSAGES_UPSERT' || eventType === 'messages.upsert') {
      // Se estava marcado como desconectado mas está recebendo mensagens, corrige o status
      if (inbox.connection_status !== 'connected') {
        await query(
          `UPDATE inboxes SET connection_status = 'connected', qr_code = NULL, updated_at = NOW() WHERE id = $1`,
          [inboxId]
        );
        io?.to(`ws:${inbox.workspace_id}`).emit('inbox:status', {
          inboxId, connectionStatus: 'connected', qrCode: null,
        });
      }

      // Evolution API v2 pode enviar referral no nível do evento (event.data.referral)
      // e não necessariamente dentro de cada mensagem
      const eventLevelReferral = event.data?.referral || event.referral || null;

      const messages = Array.isArray(event.data?.messages)
        ? event.data.messages : [event.data];

      for (const msg of messages) {
        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid) continue;

        const isGroup  = remoteJid.includes('@g.us');

        // ── Grupos: só processa se groups_enabled no inbox ────────────
        if (isGroup) {
          logger.info('[webhook] grupo detectado', {
            inboxId,
            remoteJid,
            groups_enabled: inbox.groups_enabled,
            msgKey: msg.key,
          });
          if (!inbox.groups_enabled) {
            logger.warn('[webhook] grupo ignorado — groups_enabled=false no inbox', { inboxId, remoteJid });
            continue;
          }
          await handleGroupMessage(msg, inbox, io, event);
          continue;
        }

        const isFromMe = !!msg.key?.fromMe;
        const phone    = normalizePhone(remoteJid);
        const pushName = msg.pushName || phone;

        // Para inboxes WABA oficiais, ecos de template/botão chegam com conteúdo errado
        // ("Mensagem com botões"). O broadcast service já salva a mensagem correta;
        // por isso ignoramos apenas esses tipos para evitar a duplicata errada.
        if (isFromMe && inbox.channel_type === 'whatsapp_official') {
          const msgKeys = Object.keys(msg.message || {});
          const isTemplateEcho = msgKeys.some(k =>
            k === 'buttonsMessage' || k === 'templateMessage' || k === 'interactiveResponseMessage'
          );
          if (isTemplateEcho) continue;
        }

        // ── Message sent FROM the connected phone ─────────────────────
        if (isFromMe) {
          const { content, messageType, mediaUrl, mediaMimeType } = await extractMessageContent(msg, inbox);

          // Busca ou cria o contato (mensagens enviadas pelo celular para números novos)
          const contactRes = await query(
            'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
            [inbox.workspace_id, phone]
          );
          let contact = contactRes.rows[0];
          if (!contact) {
            try {
              contact = await contactSvc.create(inbox.workspace_id, { name: phone, phone });
            } catch {
              const r = await query(
                'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
                [inbox.workspace_id, phone]
              );
              contact = r.rows[0];
            }
          }
          if (!contact) continue;

          const { conversation } = await convSvc.findOrCreate(inbox.workspace_id, {
            inboxId: inbox.id, contactId: contact.id, remoteJid,
          });

          // insertInbound with direction='outbound' — ON CONFLICT handles panel duplicates
          const message = await msgSvc.insertInbound(conversation.id, {
            content, messageType, mediaUrl, mediaMimeType,
            evolutionMsgId: msg.key?.id,
            direction: 'outbound',
          });
          if (!message) continue; // Already in DB (sent from panel, deduplicated by evolution_msg_id)

          await convSvc.refreshLastMessage(conversation.id, 'outbound');

          // Registra tempo de 1ª resposta (igual ao painel, mas para respostas pelo celular)
          await query(
            `UPDATE conversations
             SET first_response_at = COALESCE(first_response_at, NOW()),
                 response_time_seconds = CASE
                   WHEN first_response_at IS NULL AND last_inbound_at IS NOT NULL
                   THEN EXTRACT(EPOCH FROM (NOW() - last_inbound_at))::int
                   ELSE response_time_seconds
                 END,
                 bot_active = false
             WHERE id = $1`,
            [conversation.id]
          );

          // Move deal Novo Lead → Em Atendimento quando responde pelo celular
          const kanbanSvc = require('../kanban/kanban.service');
          kanbanSvc.moveToAttending(conversation.id).catch(() => {});

          io?.to(`conv:${conversation.id}`).emit('message:new', { ...message, contact_name: contact.name });
          io?.to(`ws:${inbox.workspace_id}`).emit('message:new', { ...message, contact_name: contact.name });
          io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
            conversationId:  conversation.id,
            lastMessageAt:   new Date(),
            lastMessageText: content,
            unreadCount:     0,
          });
          continue;
        }

        // ── Inbound message from contact ──────────────────────────────

        // Upsert contact
        let contact;
        try {
          contact = await contactSvc.create(inbox.workspace_id, { name: pushName, phone });
        } catch {
          const r = await query(
            'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
            [inbox.workspace_id, phone]
          );
          contact = r.rows[0];
        }
        if (!contact) continue;

        // Click-to-WhatsApp attribution
        // Evolution API v2 com mensagem tipo "conversation" coloca o externalAdReply
        // em msg.contextInfo (nível raiz), não dentro de msg.message.*.contextInfo
        const referral = msg.referral
          || eventLevelReferral
          || msg.contextInfo?.externalAdReply
          || msg.message?.extendedTextMessage?.contextInfo?.externalAdReply
          || msg.message?.imageMessage?.contextInfo?.externalAdReply
          || msg.message?.videoMessage?.contextInfo?.externalAdReply
          || msg.message?.documentMessage?.contextInfo?.externalAdReply
          || msg.message?.audioMessage?.contextInfo?.externalAdReply
          || msg.message?.messageContextInfo?.externalAdReply
          || null;

        const metaRef      = referral?.ref || referral?.headline || referral?.title || null;
        const metaCtwaClid = referral?.ctwaClid || referral?.ctwa_clid || null;
        const metaAdId     = referral?.sourceId || referral?.source_id || referral?.sourceID || null;
        const metaSource   = (metaRef || metaCtwaClid || metaAdId) ? 'paid' : 'organic';

        // Log sempre para diagnóstico — mostra estrutura do payload para identificar onde chega o referral
        logger.info('[meta-referral] análise da mensagem', {
          phone,
          hasMsgReferral:        !!msg.referral,
          hasEventReferral:      !!eventLevelReferral,
          hasExternalAdReply:    !!msg.message?.extendedTextMessage?.contextInfo?.externalAdReply,
          msgTopKeys:            Object.keys(msg).filter(k => !['key','message','messageStubParameters'].includes(k)),
          messageTypes:          Object.keys(msg.message || {}),
          metaSource,
          metaRef,
          metaCtwaClid:          metaCtwaClid ? '✓' : null,
          metaAdId:              metaAdId ? '✓' : null,
        });

        const { conversation, created } = await convSvc.findOrCreate(inbox.workspace_id, {
          inboxId: inbox.id, contactId: contact.id, remoteJid,
        });

        // Salva atribuição quando esta mensagem tem dados Meta E a conversa ainda não tem
        // atribuição paga — simplificado para evitar falso negativo em campos null
        const convAlreadyAttributed = conversation.meta_source === 'paid';

        if (metaSource === 'paid' && !convAlreadyAttributed) {
          // Extrai campos extras do referral para exibição
          const metaSourceUrl = referral?.sourceUrl || referral?.source_url || null;
          const metaHeadline  = referral?.headline || referral?.title || null;

          await query(
            `UPDATE conversations
             SET meta_ref = $1, meta_ctwa_clid = $2, meta_source = $3, meta_ad_id = $4
             WHERE id = $5`,
            [metaRef, metaCtwaClid, 'paid', metaAdId, conversation.id]
          );
          conversation.meta_source = 'paid';

          // Estratégia de nome em cascata:
          // 1. Marketing API (se tiver access_token + sourceId)
          // 2. ref configurado no anúncio
          // 3. headline do externalAdReply
          // 4. Sem nome (UI mostra "Meta Ads" como fallback)
          const metaSvc = require('../meta/meta.service');
          const wsTokenRes = await query(
            'SELECT meta_access_token FROM workspaces WHERE id = $1',
            [inbox.workspace_id]
          );
          const accessToken = wsTokenRes.rows[0]?.meta_access_token;

          if (accessToken && metaAdId) {
            // Busca nome real via Marketing API
            metaSvc.fetchAdDetails(accessToken, metaAdId)
              .then(async (adInfo) => {
                if (!adInfo) {
                  // Marketing API falhou: usa ref ou headline como fallback
                  const fallbackName = metaRef || metaHeadline;
                  if (fallbackName) {
                    await query(`UPDATE conversations SET meta_ad_name = $1 WHERE id = $2`, [fallbackName, conversation.id]);
                  }
                  return;
                }
                await query(
                  `UPDATE conversations
                   SET meta_ad_name = $1, meta_adset_name = $2, meta_campaign_name = $3
                   WHERE id = $4`,
                  [adInfo.ad_name, adInfo.adset_name, adInfo.campaign_name, conversation.id]
                );
                logger.info('[meta-referral] anúncio enriquecido via Marketing API', { conversationId: conversation.id, ...adInfo });
              })
              .catch(err => {
                logger.warn('[meta-referral] Marketing API falhou', { err: err.message });
                // Salva fallback mesmo assim
                const fallbackName = metaRef || metaHeadline;
                if (fallbackName) {
                  query(`UPDATE conversations SET meta_ad_name = $1 WHERE id = $2`, [fallbackName, conversation.id]).catch(() => {});
                }
              });
          } else {
            // Sem access_token ou sem sourceId — usa ref/headline se disponível
            const fallbackName = metaRef || metaHeadline;
            if (fallbackName) {
              await query(`UPDATE conversations SET meta_ad_name = $1 WHERE id = $2`, [fallbackName, conversation.id]);
            }
            logger.info('[meta-referral] atribuição salva sem Marketing API', {
              conversationId: conversation.id,
              hasAccessToken: !!accessToken,
              hasAdId: !!metaAdId,
              fallbackName,
              metaCtwaClid: metaCtwaClid ? '✓' : null,
            });
          }
        }

        const { content, messageType, mediaUrl, mediaMimeType } = await extractMessageContent(msg, inbox);

        const message = await msgSvc.insertInbound(conversation.id, {
          content, messageType, mediaUrl, mediaMimeType, evolutionMsgId: msg.key?.id,
        });
        if (!message) continue;

        // Extrai texto de PDFs recebidos para análise de IA
        if (messageType === 'document' && mediaMimeType === 'application/pdf' && mediaUrl && message.id) {
          require('../../services/pdf.service').extractPdfText(message.id, mediaUrl).catch(() => {});
        }

        await convSvc.refreshLastMessage(conversation.id);
        await query(`UPDATE conversations SET last_inbound_at = NOW() WHERE id = $1`, [conversation.id]);

        // ── Auto-assign (round-robin) ─────────────────────────────────
        if (created && inbox.auto_assign && !conversation.assignee_id) {
          const agentId = await autoAssignAgent(inbox.workspace_id, inbox.id, conversation.department_id);
          if (agentId) {
            await query(
              'UPDATE conversations SET assignee_id = $1 WHERE id = $2',
              [agentId, conversation.id]
            );
            conversation.assignee_id = agentId;
          }
        }

        // ── Auto-create CRM deal ──────────────────────────────────────
        if (created) {
          kanbanSvc.createDealFromConversation(inbox.workspace_id, {
            contactId:      contact.id,
            contactName:    contact.name,
            conversationId: conversation.id,
            assigneeId:     conversation.assignee_id || null,
            inboxId:        inbox.id,
            metaRef,
            metaCtwaClid,
            metaSource,
          }).catch(err => logger.warn('Auto-deal creation failed', { err: err.message }));

          // Envia evento Lead para Meta CAPI se workspace tiver pixel + conversions token
          const metaSvc = require('../meta/meta.service');
          const wsCapiRes = await query(
            'SELECT id, meta_pixel_id, meta_conversions_token FROM workspaces WHERE id = $1',
            [inbox.workspace_id]
          );
          const wsCapi = wsCapiRes.rows[0];
          if (wsCapi?.meta_pixel_id && wsCapi?.meta_conversions_token) {
            metaSvc.sendLeadEvent(wsCapi, { contact, metaCtwaClid }).catch(err =>
              logger.warn('Meta Lead event failed', { err: err.message })
            );
          }
        }

        // ── Chatbot response ──────────────────────────────────────────
        const isNewOrBotActive = created || conversation.bot_active;
        if (inbox.chatbot_enabled && !conversation.assignee_id && isNewOrBotActive) {
          const wsRes = await query(
            'SELECT anthropic_api_key, openai_api_key, ai_provider, ai_model, ai_ignore_groups FROM workspaces WHERE id = $1',
            [inbox.workspace_id]
          );
          const ws       = wsRes.rows[0] || {};
          const provider = ws.ai_provider || 'anthropic';
          const apiKey   = provider === 'openai' ? ws.openai_api_key : ws.anthropic_api_key;

          // Respeita configuração de ignorar grupos no funil de IA
          if (ws.ai_ignore_groups && conversation.is_group) {
            // não executa IA em grupos
          } else if (apiKey) {
            await query('UPDATE conversations SET bot_active = true WHERE id = $1', [conversation.id]);

            aiSvc.generateChatbotResponse(conversation.id, inbox.chatbot_prompt, apiKey, provider, ws.ai_model || null)
              .then(async (botReply) => {
                if (!botReply) return;
                const botMsg = await msgSvc.send(conversation.id, null, {
                  content: botReply, messageType: 'text', isPrivate: false,
                });
                io?.to(`conv:${conversation.id}`).emit('message:new', botMsg);
                io?.to(`ws:${inbox.workspace_id}`).emit('message:new', botMsg);
                io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
                  conversationId:  conversation.id,
                  lastMessageAt:   new Date(),
                  lastMessageText: botReply,
                });
              })
              .catch(err => logger.warn('Chatbot send failed', { err: err.message }));
          }
        }

        // ── Broadcast ─────────────────────────────────────────────────
        if (created) {
          io?.to(`ws:${inbox.workspace_id}`).emit('conversation:new', {
            conversationId: conversation.id, contactName: contact.name, inboxId: inbox.id,
          });
        }
        io?.to(`conv:${conversation.id}`).emit('message:new', { ...message, contact_name: contact.name });
        io?.to(`ws:${inbox.workspace_id}`).emit('message:new', { ...message, contact_name: contact.name });
        io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
          conversationId:  conversation.id,
          lastMessageAt:   new Date(),
          lastMessageText: content,
          unreadCount:     (conversation.unread_count || 0) + 1,
        });
      }
    }
  } catch (err) {
    logger.error('Webhook processing error', { err: err.message, inboxId });
  }
});

// ── WABA (WhatsApp Official Cloud API) webhook ─────────────────────────────
//
// Um único app Meta serve múltiplos números/WABAs.
// O Meta aceita apenas UMA URL de webhook por app — roteamos pelo phone_number_id.
//
// Configurar no Meta App:
//   URL:          https://seudominio.com/api/v1/webhooks/waba
//   Verify token: valor da env WABA_VERIFY_TOKEN
//   Campos:       messages

// GET /waba — verificação de challenge
router.get('/waba', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('[WABA] webhook verify', { mode, tokenMatch: token === process.env.WABA_VERIFY_TOKEN, envSet: !!process.env.WABA_VERIFY_TOKEN });

  if (mode !== 'subscribe') return res.sendStatus(400);
  if (!process.env.WABA_VERIFY_TOKEN || token !== process.env.WABA_VERIFY_TOKEN) return res.sendStatus(403);

  res.status(200).send(challenge);
});

// POST /waba — eventos de todas as inboxes oficiais
router.post('/waba', async (req, res) => {
  res.json({ ok: true }); // responde imediatamente — o Meta exige resposta rápida

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes) return;

    // Roteia para a inbox correta pelo phone_number_id presente no payload
    const phoneNumberId = changes.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const inboxRes = await query(
      `SELECT * FROM inboxes WHERE waba_phone_number_id = $1 AND channel_type = 'whatsapp_official'`,
      [phoneNumberId]
    );
    if (!inboxRes.rows.length) {
      logger.warn('WABA webhook: nenhuma inbox para phone_number_id', { phoneNumberId });
      return;
    }
    const inbox   = inboxRes.rows[0];
    const inboxId = inbox.id;
    const io      = req.app.get('io');

    // ── Status updates (delivered, read, failed) ─────────────────────
    if (changes.statuses?.length) {
      for (const st of changes.statuses) {
        const statusMap = { delivered: 'delivered', read: 'read', failed: 'failed' };
        const newStatus = statusMap[st.status];
        if (newStatus) {
          await query('UPDATE messages SET status = $1 WHERE evolution_msg_id = $2', [newStatus, st.id]);
          io?.emit('message:status', { evolutionMsgId: st.id, status: newStatus });
        }
      }
    }

    if (!changes.messages?.length) return;

    // Marca inbox como conectado na primeira mensagem recebida
    if (inbox.connection_status !== 'connected') {
      await query(
        `UPDATE inboxes SET connection_status = 'connected', updated_at = NOW() WHERE id = $1`,
        [inboxId]
      );
      io?.to(`ws:${inbox.workspace_id}`).emit('inbox:status', { inboxId, connectionStatus: 'connected' });
    }

    for (const msg of changes.messages) {
      const phone    = msg.from;
      const waMsgId  = msg.id;
      const pushName = changes.contacts?.find(c => c.wa_id === phone)?.profile?.name || phone;

      let content = '', messageType = 'text', mediaUrl = null, mediaMimeType = null;

      if (msg.type === 'text') {
        content     = msg.text?.body || '';
        messageType = 'text';
      } else if (['image','video','audio','document','sticker'].includes(msg.type)) {
        const mediaObj = msg[msg.type];
        content       = mediaObj?.caption || mediaObj?.filename || '';
        messageType   = msg.type === 'sticker' ? 'sticker' : msg.type;
        mediaMimeType = mediaObj?.mime_type || null;

        if (mediaObj?.id && inbox.waba_access_token) {
          try {
            const metaRes = await axios.get(
              `https://graph.facebook.com/v25.0/${mediaObj.id}`,
              { headers: { Authorization: `Bearer ${inbox.waba_access_token}` }, timeout: 10000 }
            );
            const dlUrl = metaRes.data?.url;
            if (dlUrl) {
              const dlRes = await axios.get(dlUrl, {
                headers: { Authorization: `Bearer ${inbox.waba_access_token}` },
                responseType: 'arraybuffer', timeout: 30000,
              });
              const mime     = cleanMime(mediaMimeType || 'application/octet-stream');
              const filename = `${uuidv4()}${MIME_EXT[mime] || '.bin'}`;
              mediaUrl = await storageSvc.uploadFile(Buffer.from(dlRes.data), filename, mime);
            }
          } catch (err) {
            logger.warn('WABA media download failed', { err: err.message, mediaId: mediaObj.id });
          }
        }
      } else if (msg.type === 'location') {
        const loc = msg.location;
        content     = `📍 Localização\nhttps://www.google.com/maps?q=${loc?.latitude},${loc?.longitude}`;
        messageType = 'location';
      } else if (msg.type === 'reaction') {
        content     = msg.reaction?.emoji || '👍';
        messageType = 'reaction';
      } else if (msg.type === 'interactive') {
        content     = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interação]';
        messageType = 'text';
      } else {
        content     = `[${msg.type}]`;
        messageType = 'unsupported';
      }

      // Click-to-WhatsApp attribution (referral no formato WABA)
      const referral     = msg.referral || null;
      const metaCtwaClid = referral?.ctwa_clid || null;
      const metaAdId     = referral?.source_id || null;
      const metaRef      = referral?.headline  || referral?.body || null;
      const metaSource   = (metaCtwaClid || metaAdId) ? 'paid' : 'organic';

      let contact;
      try {
        contact = await contactSvc.create(inbox.workspace_id, { name: pushName, phone });
      } catch {
        const r = await query('SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2', [inbox.workspace_id, phone]);
        contact = r.rows[0];
      }
      if (!contact) continue;

      const remoteJid = `${phone}@s.whatsapp.net`;
      const { conversation, created } = await convSvc.findOrCreate(inbox.workspace_id, {
        inboxId: inbox.id, contactId: contact.id, remoteJid,
      });

      // Salva atribuição Meta se veio referral e ainda não está atribuído
      if (metaSource === 'paid' && conversation.meta_source !== 'paid') {
        await query(
          `UPDATE conversations SET meta_ref = $1, meta_ctwa_clid = $2, meta_source = 'paid', meta_ad_id = $3 WHERE id = $4`,
          [metaRef, metaCtwaClid, metaAdId, conversation.id]
        );
      }

      const message = await msgSvc.insertInbound(conversation.id, {
        content, messageType, mediaUrl, mediaMimeType, evolutionMsgId: waMsgId,
      });
      if (!message) continue;

      await convSvc.refreshLastMessage(conversation.id);
      await query(`UPDATE conversations SET last_inbound_at = NOW() WHERE id = $1`, [conversation.id]);

      if (created && inbox.auto_assign && !conversation.assignee_id) {
        const agentId = await autoAssignAgent(inbox.workspace_id, inbox.id, conversation.department_id);
        if (agentId) {
          await query('UPDATE conversations SET assignee_id = $1 WHERE id = $2', [agentId, conversation.id]);
          conversation.assignee_id = agentId;
        }
      }

      if (created) {
        kanbanSvc.createDealFromConversation(inbox.workspace_id, {
          contactId: contact.id, contactName: contact.name,
          conversationId: conversation.id, assigneeId: conversation.assignee_id || null,
          inboxId: inbox.id, metaRef, metaCtwaClid, metaSource,
        }).catch(err => logger.warn('Auto-deal creation failed (WABA)', { err: err.message }));

        // Envia evento Lead para Meta CAPI (igual ao Evolution)
        const metaSvc    = require('../meta/meta.service');
        const wsCapiRes  = await query(
          'SELECT id, meta_pixel_id, meta_conversions_token FROM workspaces WHERE id = $1',
          [inbox.workspace_id]
        );
        const wsCapi = wsCapiRes.rows[0];
        if (wsCapi?.meta_pixel_id && wsCapi?.meta_conversions_token) {
          metaSvc.sendLeadEvent(wsCapi, { contact, metaCtwaClid }).catch(err =>
            logger.warn('Meta Lead event failed (WABA)', { err: err.message })
          );
        }

        io?.to(`ws:${inbox.workspace_id}`).emit('conversation:new', {
          conversationId: conversation.id, contactName: contact.name, inboxId: inbox.id,
        });
      }

      if (inbox.chatbot_enabled && !conversation.assignee_id && (created || conversation.bot_active)) {
        const wsRes = await query(
          'SELECT anthropic_api_key, openai_api_key, ai_provider, ai_model FROM workspaces WHERE id = $1',
          [inbox.workspace_id]
        );
        const ws       = wsRes.rows[0] || {};
        const provider = ws.ai_provider || 'anthropic';
        const apiKey   = provider === 'openai' ? ws.openai_api_key : ws.anthropic_api_key;
        if (apiKey) {
          await query('UPDATE conversations SET bot_active = true WHERE id = $1', [conversation.id]);
          aiSvc.generateChatbotResponse(conversation.id, inbox.chatbot_prompt, apiKey, provider, ws.ai_model || null)
            .then(async (botReply) => {
              if (!botReply) return;
              const botMsg = await msgSvc.send(conversation.id, null, { content: botReply, messageType: 'text' });
              io?.to(`conv:${conversation.id}`).emit('message:new', botMsg);
              io?.to(`ws:${inbox.workspace_id}`).emit('message:new', botMsg);
            })
            .catch(err => logger.warn('Chatbot send failed (WABA)', { err: err.message }));
        }
      }

      io?.to(`conv:${conversation.id}`).emit('message:new', { ...message, contact_name: contact.name });
      io?.to(`ws:${inbox.workspace_id}`).emit('message:new', { ...message, contact_name: contact.name });
      io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
        conversationId: conversation.id, lastMessageAt: new Date(),
        lastMessageText: content, unreadCount: (conversation.unread_count || 0) + 1,
      });
    }
  } catch (err) {
    logger.error('WABA webhook processing error', { err: err.message });
  }
});

module.exports = router;
