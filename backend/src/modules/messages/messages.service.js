'use strict';

const axios  = require('axios');
const path   = require('path');
const { query } = require('../../config/database');
const convSvc   = require('../conversations/conversations.service');

const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif',  '.webp': 'image/webp',
  '.mp4': 'video/mp4',  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

async function list(conversationId, { page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;

  const countRes = await query(
    'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
    [conversationId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  // Retorna as mensagens mais recentes e reordena em ordem cronológica para exibição
  const r = await query(
    `SELECT * FROM (
       SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3
     ) sub
     ORDER BY created_at ASC`,
    [conversationId, limit, offset]
  );

  return { data: r.rows, total, page, limit };
}

async function sendViaWaba(conv, message, content, messageType, mediaUrl) {
  const { waba_phone_number_id: phoneNumberId, waba_access_token: token } = conv;
  if (!phoneNumberId || !token) return;

  const to = conv.remote_jid?.replace(/@.+$/, '') || conv.remote_jid;
  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let body;
  if (messageType === 'template') {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: content, // deve ser objeto { name, language, components }
    };
  } else if (messageType !== 'text' && mediaUrl) {
    const typeMap = { image: 'image', video: 'video', audio: 'audio', document: 'document' };
    const waType  = typeMap[messageType] || 'document';
    body = {
      messaging_product: 'whatsapp',
      to,
      type: waType,
      [waType]: { link: mediaUrl, caption: content || undefined },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: content, preview_url: false },
    };
  }

  const res = await axios.post(url, body, { headers, timeout: 15000 });
  const waMsgId = res?.data?.messages?.[0]?.id;
  if (waMsgId) {
    await query('UPDATE messages SET evolution_msg_id = $1 WHERE id = $2', [waMsgId, message.id]);
    message.evolution_msg_id = waMsgId;
  }
}

async function send(conversationId, senderId, { content, messageType = 'text', mediaUrl, isPrivate = false }) {
  const convRes = await query(
    `SELECT c.*, i.channel_type,
            i.evolution_api_url, i.evolution_api_key, i.evolution_instance,
            i.waba_phone_number_id, i.waba_access_token,
            c.remote_jid, c.workspace_id
     FROM conversations c
     JOIN inboxes i ON i.id = c.inbox_id
     WHERE c.id = $1`,
    [conversationId]
  );
  if (!convRes.rows.length) throw Object.assign(new Error('Conversa não encontrada'), { status: 404 });
  const conv = convRes.rows[0];

  const msgRes = await query(
    `INSERT INTO messages
       (conversation_id, direction, message_type, content, media_url, sender_id, status, is_private)
     VALUES ($1,'outbound',$2,$3,$4,$5,'sent',$6) RETURNING *`,
    [conversationId, messageType, content || null, mediaUrl || null, senderId, isPrivate]
  );
  const message = msgRes.rows[0];

  // Only public messages update last_message and trigger real WhatsApp send
  if (!isPrivate) {
    await convSvc.refreshLastMessage(conversationId, 'outbound');

    // Track first response time + reset bot_active when a real agent responds
    if (senderId) {
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
        [conversationId]
      );

      // Move deal Novo Lead → Em Atendimento e dispara qualificação IA
      require('../kanban/kanban.service')
        .moveToAttending(conversationId)
        .catch(() => {});
    }

    // Route send based on channel type
    if (conv.channel_type === 'whatsapp_official') {
      try {
        await sendViaWaba(conv, message, content, messageType, mediaUrl);
      } catch (err) {
        const errMsg = err?.response?.data || err?.message;
        require('../../utils/logger').error('WABA send failed', { errMsg, conversationId });
        await query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', message.id]);
        message.status = 'failed';
      }
    } else if (conv.evolution_api_url && conv.evolution_instance) {
      // Send via Evolution API
      try {
        const number = conv.remote_jid?.replace(/@.+$/, '') || conv.remote_jid;
        const baseUrl = `${conv.evolution_api_url}`;
        const instance = conv.evolution_instance;
        const headers  = { apikey: conv.evolution_api_key };

        let evoRes;
        if (messageType && messageType !== 'text' && mediaUrl) {
          const filename = path.basename(new URL(mediaUrl).pathname);
          const ext      = path.extname(filename).toLowerCase();
          const mime     = EXT_MIME[ext] || 'application/octet-stream';
          const storageSvc = require('../../services/storage.service');
          const fileBuffer = await storageSvc.getFileBuffer(filename);
          const base64     = fileBuffer.toString('base64');

          evoRes = await axios.post(
            `${baseUrl}/message/sendMedia/${instance}`,
            {
              number,
              mediatype: messageType,
              media:     base64,
              mimetype:  mime,
              caption:   content || '',
              fileName:  filename,
            },
            { headers, timeout: 30000 }
          );
        } else {
          evoRes = await axios.post(
            `${baseUrl}/message/sendText/${instance}`,
            { number, text: content },
            { headers, timeout: 10000 }
          );
        }

        const evoMsgId = evoRes?.data?.key?.id;
        if (evoMsgId) {
          await query('UPDATE messages SET evolution_msg_id = $1 WHERE id = $2', [evoMsgId, message.id]);
          message.evolution_msg_id = evoMsgId;
        }
      } catch (err) {
        const errMsg = err?.response?.data || err?.message;
        require('../../utils/logger').error('Evolution API send failed', { errMsg, conversationId });
        await query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', message.id]);
        message.status = 'failed';
      }
    }
  }

  return message;
}

async function insertInbound(conversationId, { content, messageType, mediaUrl, mediaMimeType, evolutionMsgId, direction = 'inbound' }) {
  // Para mensagens outbound (isFromMe=true), tenta vincular o evolution_msg_id a uma
  // mensagem já enviada pelo painel (que tem evolution_msg_id = NULL).
  // Isso evita duplicatas quando o webhook chega antes da resposta da Evolution API.
  if (direction === 'outbound' && evolutionMsgId) {
    const upd = await query(
      `UPDATE messages
       SET evolution_msg_id = $1
       WHERE id = (
         SELECT id FROM messages
         WHERE conversation_id = $2
           AND direction = 'outbound'
           AND evolution_msg_id IS NULL
           AND message_type = $3
           AND (content = $4 OR (content IS NULL AND $4 IS NULL))
           AND created_at > NOW() - INTERVAL '3 minutes'
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING *`,
      [evolutionMsgId, conversationId, messageType || 'text', content || null]
    );
    if (upd.rows.length) return null; // Vinculado à mensagem do painel, não emite duplicata
  }

  const r = await query(
    `INSERT INTO messages
       (conversation_id, direction, message_type, content, media_url, media_mime_type, evolution_msg_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'sent')
     ON CONFLICT (evolution_msg_id) DO NOTHING
     RETURNING *`,
    [conversationId, direction, messageType || 'text', content || null,
      mediaUrl || null, mediaMimeType || null, evolutionMsgId || null]
  );
  return r.rows[0] || null;
}

async function sendOutbound(workspaceId, inboxId, phone, text) {
  const convSvc = require('../conversations/conversations.service');
  const contactRes = await query(
    'SELECT id FROM contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1',
    [workspaceId, phone]
  );
  const contactId = contactRes.rows[0]?.id || null;
  const { conversation } = await convSvc.findOrCreate(workspaceId, {
    inboxId, contactId, remoteJid: phone,
  });
  return send(conversation.id, null, { content: text, messageType: 'text' });
}

module.exports = { list, send, insertInbound, sendOutbound };
