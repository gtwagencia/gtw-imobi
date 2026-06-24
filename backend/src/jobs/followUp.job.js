'use strict';

const cron    = require('node-cron');
const { query } = require('../config/database');
const aiSvc   = require('../services/ai.service');
const msgSvc  = require('../modules/messages/messages.service');
const notifSvc = require('../modules/notifications/notifications.service');
const logger  = require('../utils/logger');

// ── Business hours helpers ─────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function isWithinBusinessHours(businessHours) {
  if (!businessHours?.enabled) return true;

  const tz       = businessHours.timezone || 'America/Sao_Paulo';
  const now      = new Date();
  const tzDate   = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const dayName  = DAY_NAMES[tzDate.getDay()];
  const dayConf  = businessHours[dayName];

  if (!dayConf?.enabled) return false;

  const [openH,  openM]  = dayConf.open.split(':').map(Number);
  const [closeH, closeM] = dayConf.close.split(':').map(Number);

  const currentMinutes = tzDate.getHours() * 60 + tzDate.getMinutes();
  const openMinutes    = openH  * 60 + openM;
  const closeMinutes   = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// ── Follow-up job ──────────────────────────────────────────────────────────

async function runFollowUp(trigger) {
  const intervals = {
    '30min': { minutes: 30,   max: 90   },
    '1day':  { minutes: 1440, max: 1560 },
    '3day':  { minutes: 4320, max: 4440 },
  };

  const { minutes, max } = intervals[trigger];

  const wsRes = await query(
    `SELECT id, anthropic_api_key, openai_api_key, ai_provider, ai_model, business_hours, follow_up_enabled
     FROM workspaces
     WHERE follow_up_enabled = true
       AND (anthropic_api_key IS NOT NULL OR openai_api_key IS NOT NULL)`
  );

  for (const ws of wsRes.rows) {
    if (!isWithinBusinessHours(ws.business_hours)) {
      logger.debug('Follow-up skipped: outside business hours', { workspaceId: ws.id });
      continue;
    }

    // Para triggers fora da janela de 24h do WhatsApp, pula canais WhatsApp
    // (WABA e Evolution não aceitam mensagens livres após 24h sem inbound)
    const skipWhatsApp = trigger !== '30min'
      ? `AND i.channel_type NOT IN ('whatsapp', 'whatsapp_official')`
      : '';

    const convRes = await query(
      `SELECT c.id, c.workspace_id, c.assignee_id
       FROM conversations c
       JOIN inboxes i ON i.id = c.inbox_id
       WHERE c.workspace_id = $1
         AND c.status = 'open'
         AND c.last_inbound_at IS NOT NULL
         AND c.last_inbound_at <= NOW() - ($2 * INTERVAL '1 minute')
         AND c.last_inbound_at >= NOW() - ($3 * INTERVAL '1 minute')
         ${skipWhatsApp}
         AND NOT EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id
             AND m.direction = 'outbound'
             AND m.is_private = false
             AND m.created_at > c.last_inbound_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM follow_up_logs fl
           WHERE fl.conversation_id = c.id
             AND fl.trigger_type = $4
             AND fl.sent_at > NOW() - interval '7 days'
         )`,
      [ws.id, minutes, max, trigger]
    );

    logger.info(`Follow-up ${trigger}: found ${convRes.rows.length} conversations`, { workspaceId: ws.id });

    for (const conv of convRes.rows) {
      try {
        const provider    = ws.ai_provider || 'anthropic';
        const apiKey      = provider === 'openai' ? ws.openai_api_key : ws.anthropic_api_key;
        const messageText = await aiSvc.generateFollowUp(conv.id, trigger, apiKey, provider, ws.ai_model || null);
        if (!messageText) continue;

        await msgSvc.send(conv.id, conv.assignee_id || null, {
          content: messageText, messageType: 'text',
        });

        await query(
          `INSERT INTO follow_up_logs
             (conversation_id, workspace_id, trigger_type, message_content, status)
           VALUES ($1,$2,$3,$4,'sent')`,
          [conv.id, ws.id, trigger, messageText]
        );

        logger.info('Follow-up sent', { conversationId: conv.id, trigger });
      } catch (err) {
        await query(
          `INSERT INTO follow_up_logs
             (conversation_id, workspace_id, trigger_type, message_content, status, error_message)
           VALUES ($1,$2,$3,'','failed',$4)`,
          [conv.id, ws.id, trigger, err.message]
        ).catch(() => {});

        logger.warn('Follow-up failed', { conversationId: conv.id, trigger, err: err.message });
      }
    }
  }
}

// ── Backfill: move deals respondidos de "Novo Lead" para "Em Atendimento" ──
// Cobre conversas antigas e qualquer edge case não capturado em tempo real.

async function backfillAttending() {
  try {
    const r = await query(
      `UPDATE deals
       SET stage_id = sub.em_id, updated_at = NOW()
       FROM (
         SELECT d.id AS deal_id, atend.id AS em_id
         FROM deals d
         JOIN kanban_stages novo  ON novo.workspace_id  = d.workspace_id
                                 AND novo.name          = 'Novo Lead'
         JOIN kanban_stages atend ON atend.workspace_id = d.workspace_id
                                 AND atend.name         = 'Em Atendimento'
         WHERE d.stage_id = novo.id
           AND d.conversation_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM messages m
             WHERE m.conversation_id = d.conversation_id
               AND m.direction = 'outbound'
               AND m.is_private = false
               AND m.sender_id IS NOT NULL   -- enviado por agente real, não bot
           )
       ) sub
       WHERE deals.id = sub.deal_id
       RETURNING deals.id`
    );
    if (r.rows.length) {
      logger.info(`Backfill: ${r.rows.length} deals movidos para Em Atendimento`);
    }
  } catch (err) {
    logger.warn('Backfill attending failed', { err: err.message });
  }
}

// ── AI Analysis job ────────────────────────────────────────────────────────

async function runAiAnalysis() {
  const r = await query(
    `SELECT d.id, d.workspace_id
     FROM deals d
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE w.ai_analysis_enabled = true
       AND (w.anthropic_api_key IS NOT NULL OR w.openai_api_key IS NOT NULL)
       AND d.conversation_id IS NOT NULL
       AND (
         d.ai_analyzed_at IS NULL
         OR (
           d.ai_analyzed_at < NOW() - (COALESCE(w.ai_analysis_interval_minutes, 60) * INTERVAL '1 minute')
           AND EXISTS (
             SELECT 1 FROM messages m
             WHERE m.conversation_id = d.conversation_id
               AND m.direction = 'inbound'
               AND m.is_private = false
               AND m.created_at > d.ai_analyzed_at
           )
         )
       )
     ORDER BY d.updated_at DESC
     LIMIT 50`
  );

  for (const deal of r.rows) {
    try {
      await aiSvc.analyzeDeal(deal.id, deal.workspace_id);
      logger.debug('AI analysis completed', { dealId: deal.id });
    } catch (err) {
      logger.warn('AI analysis failed', { dealId: deal.id, err: err.message });
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ── SLA breach detection + reassignment ───────────────────────────────────

async function runSlaCheck(io) {
  const wsRes = await query(
    `SELECT id, sla_response_minutes, business_hours,
            anthropic_api_key, openai_api_key, custom_ai_api_key, ai_base_url, ai_provider, ai_model
     FROM workspaces
     WHERE sla_response_minutes IS NOT NULL AND sla_response_minutes > 0`
  );

  for (const ws of wsRes.rows) {
    // Fora do horário de atendimento humano: não redistribui leads
    if (!isWithinBusinessHours(ws.business_hours)) {
      logger.debug('SLA check skipped: outside business hours', { workspaceId: ws.id });
      continue;
    }

    // Carimba sla_effective_start_at para conversas que chegaram fora do horário.
    // O timer começa quando o atendimento humano abre, não na criação da conversa.
    await query(
      `UPDATE conversations
       SET sla_effective_start_at = NOW()
       WHERE workspace_id = $1
         AND status = 'open'
         AND sla_breached = false
         AND first_response_at IS NULL
         AND sla_effective_start_at IS NULL
         AND sla_reassigned_at IS NULL`,
      [ws.id]
    );

    // Conversas que venceram o SLA (novas ou já redistribuídas onde o novo corretor também não respondeu)
    const r = await query(
      `SELECT c.id, c.assignee_id, c.contact_id, c.department_id, c.bot_handoff_summary
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.status = 'open'
         AND c.sla_breached = false
         AND c.first_response_at IS NULL
         AND c.sla_effective_start_at IS NOT NULL
         AND COALESCE(c.sla_reassigned_at, c.sla_effective_start_at) <= NOW() - ($2 * INTERVAL '1 minute')`,
      [ws.id, ws.sla_response_minutes]
    );

    const provider = ws.ai_provider || 'anthropic';
    const apiKey   = provider === 'custom' ? ws.custom_ai_api_key
                   : provider === 'openai'  ? ws.openai_api_key
                   : ws.anthropic_api_key;
    const baseUrl  = provider === 'custom' ? ws.ai_base_url : null;
    const canAi    = !!(apiKey || baseUrl);

    for (const conv of r.rows) {
      try {
        const contactRes = await query('SELECT name FROM contacts WHERE id = $1', [conv.contact_id]);
        const contactName = contactRes.rows[0]?.name || 'Lead';

        // IA gera novo resumo atualizado para o próximo corretor
        let newSummary = conv.bot_handoff_summary;
        if (canAi) {
          newSummary = await aiSvc.generateHandoffSummary(
            conv.id, conv.bot_handoff_summary, apiKey, provider, ws.ai_model || null, baseUrl
          ) || conv.bot_handoff_summary;
        }

        // Próximo corretor no departamento com menos conversas abertas
        let nextAgentId = null;
        if (conv.department_id) {
          const agentRes = await query(
            `SELECT wm.user_id
             FROM workspace_memberships wm
             JOIN users u ON u.id = wm.user_id AND u.is_active = true
             LEFT JOIN conversations c2
               ON c2.assignee_id = wm.user_id AND c2.workspace_id = $1 AND c2.status = 'open'
             WHERE wm.workspace_id = $1
               AND wm.role IN ('agent','member','auxiliar_administrativo')
               AND wm.department_id = $2
               AND wm.user_id != $3
             GROUP BY wm.user_id
             ORDER BY COUNT(c2.id) ASC, RANDOM()
             LIMIT 1`,
            [ws.id, conv.department_id, conv.assignee_id || '00000000-0000-0000-0000-000000000000']
          );
          nextAgentId = agentRes.rows[0]?.user_id || null;
        }

        if (nextAgentId) {
          const summaryClause = newSummary ? ', bot_handoff_summary = $3' : '';
          const params = newSummary ? [nextAgentId, conv.id, newSummary] : [nextAgentId, conv.id];
          await query(
            `UPDATE conversations
             SET assignee_id = $1, assignee_assigned_at = NOW(),
                 sla_reassigned_at = NOW(), sla_breached = false${summaryClause}
             WHERE id = $2`,
            params
          );

          if (conv.assignee_id) {
            await notifSvc.create({
              workspaceId: ws.id, userId: conv.assignee_id, conversationId: conv.id,
              type: 'sla_breached', title: 'Atendimento redistribuído por SLA',
              message: `${contactName} foi redirecionado para outro corretor por falta de resposta no prazo.`,
            }, io);
          }
          await notifSvc.create({
            workspaceId: ws.id, userId: nextAgentId, conversationId: conv.id,
            type: 'conversation_assigned', title: 'Lead atribuído por SLA',
            message: `${contactName} foi redirecionado para você. Responda o quanto antes.`,
          }, io);

          const payload = { conversationId: conv.id, assigneeId: nextAgentId, botHandoffSummary: newSummary || undefined };
          io?.to(`ws:${ws.id}`).emit('conversation:updated', payload);
          io?.to(`conv:${conv.id}`).emit('conversation:updated', payload);

          logger.info('SLA reassignment', { conversationId: conv.id, from: conv.assignee_id, to: nextAgentId });
        } else {
          // Sem próximo corretor disponível — estado terminal
          await query(`UPDATE conversations SET sla_breached = true WHERE id = $1`, [conv.id]);

          if (conv.assignee_id) {
            await notifSvc.create({
              workspaceId: ws.id, userId: conv.assignee_id, conversationId: conv.id,
              type: 'sla_breached', title: 'SLA de resposta vencido',
              message: `${contactName} está aguardando resposta há mais de ${ws.sla_response_minutes} minutos.`,
            }, io);
          }
        }
      } catch (err) {
        logger.warn('SLA check failed', { conversationId: conv.id, err: err.message });
      }
    }
  }
}

// ── Auto-encerramento 24h após último contato humano sem resposta do lead ──

async function runAutoClose(io) {
  // Encerra conversas onde um humano (corretor/agente) respondeu,
  // mas o lead ficou em silêncio por 24h desde a última mensagem humana.
  // sla_effective_start_at garante que só fechamos conversas que estavam
  // dentro do período de atendimento humano configurado.
  const r = await query(
    `SELECT c.id, c.workspace_id
     FROM conversations c,
          LATERAL (
            SELECT MAX(m.created_at) AS last_human_at
            FROM messages m
            WHERE m.conversation_id = c.id
              AND m.direction = 'outbound'
              AND m.is_private = false
              AND m.sender_id IS NOT NULL
          ) lh
     WHERE c.status = 'open'
       AND c.bot_active = false
       AND c.sla_effective_start_at IS NOT NULL
       AND lh.last_human_at IS NOT NULL
       AND lh.last_human_at <= NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM messages m
         WHERE m.conversation_id = c.id
           AND m.direction = 'inbound'
           AND m.is_private = false
           AND m.created_at > lh.last_human_at
       )`
  );

  for (const conv of r.rows) {
    try {
      await query(
        `UPDATE conversations SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
        [conv.id]
      );
      io?.to(`ws:${conv.workspace_id}`).emit('conversation:updated', {
        conversationId: conv.id,
        status: 'resolved',
      });
      logger.info('Auto-closed: 24h sem resposta do lead após atendimento humano', { conversationId: conv.id });
    } catch (err) {
      logger.warn('Auto-close failed', { conversationId: conv.id, err: err.message });
    }
  }
}

// ── Lead esquecido (sem retorno do corretor) ───────────────────────────────

async function runStaleLeadCheck(io) {
  const wsRes = await query(
    `SELECT id, lead_stale_hours FROM workspaces WHERE lead_stale_hours > 0`
  );

  for (const ws of wsRes.rows) {
    const r = await query(
      `SELECT c.id, c.assignee_id, ct.name AS contact_name
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE c.workspace_id = $1
         AND c.status = 'open'
         AND c.assignee_id IS NOT NULL
         AND c.last_inbound_at IS NOT NULL
         AND c.last_inbound_at <= NOW() - ($2 * INTERVAL '1 hour')
         AND NOT EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id
             AND m.direction = 'outbound'
             AND m.is_private = false
             AND m.created_at > c.last_inbound_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM crm_notifications n
           WHERE n.conversation_id = c.id
             AND n.type = 'lead_stale'
             AND n.created_at > NOW() - ($2 * INTERVAL '1 hour')
         )`,
      [ws.id, ws.lead_stale_hours]
    );

    for (const conv of r.rows) {
      try {
        await notifSvc.create({
          workspaceId:    ws.id,
          userId:         conv.assignee_id,
          conversationId: conv.id,
          type:           'lead_stale',
          title:          'Lead sem retorno',
          message:        `${conv.contact_name} está sem resposta sua há mais de ${ws.lead_stale_hours}h.`,
        }, io);
      } catch (err) {
        logger.warn('Stale lead notification failed', { conversationId: conv.id, err: err.message });
      }
    }
  }
}

// ── Ticket reminders ───────────────────────────────────────────────────────

async function runTicketReminders() {
  const ticketSvc = require('../modules/tickets/tickets.service');
  const reminders = await ticketSvc.getDueReminders();
  for (const reminder of reminders) {
    try {
      // Send via WhatsApp if workspace has messaging configured
      // For now just log — real delivery can be wired per workspace preferences
      logger.info('Ticket reminder due', {
        ticketTitle: reminder.ticket_title,
        userName:    reminder.user_name,
        message:     reminder.message,
        workspaceId: reminder.workspace_id,
      });
      await ticketSvc.markReminderSent(reminder.id);
    } catch (err) {
      logger.error('Ticket reminder send error', { reminderId: reminder.id, err: err.message });
    }
  }
}

async function runRecurringTickets() {
  const ticketSvc = require('../modules/tickets/tickets.service');
  const spawned = await ticketSvc.spawnDueRecurringTickets();
  if (spawned.length) {
    logger.info('Recurring tickets spawned', { count: spawned.length });
  }
}

// ── Ticket due-today email ─────────────────────────────────────────────────

async function runTicketDueSoon() {
  const notif = require('../services/ticket-notifications');
  // Tickets cujo prazo é HOJE (no fuso de São Paulo), com assignee, não resolvidos
  const r = await query(
    `SELECT t.id
     FROM tickets t
     WHERE t.due_date IS NOT NULL
       AND t.resolved_at IS NULL
       AND t.assignee_id IS NOT NULL
       AND (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`
  );
  for (const row of r.rows) {
    try {
      await notif.notifyDueSoon(row.id);
      logger.info('Due-soon email sent', { ticketId: row.id });
    } catch (err) {
      logger.warn('Due-soon email failed', { ticketId: row.id, err: err.message });
    }
  }
}

// ── Expiração de reservas de lotes/imóveis ─────────────────────────────────

async function runExpireReservations() {
  const r = await query(
    `UPDATE properties
     SET status = 'disponivel', reserved_until = NULL, reserved_by = NULL
     WHERE status = 'reservado'
       AND reserved_until IS NOT NULL
       AND reserved_until < NOW()
     RETURNING id`
  );
  if (r.rows.length) {
    logger.info(`Reservas expiradas: ${r.rows.length} imóvel(is) voltaram para "disponível"`);
  }
}

// ── Vencimento de documentos do cofre de imóveis ───────────────────────────

const DOC_CATEGORY_LABELS = {
  matricula: 'Matrícula', escritura: 'Escritura', iptu: 'IPTU',
  habite_se: 'Habite-se', contrato: 'Contrato', certidao_negativa: 'Certidão negativa',
  laudo_avaliacao: 'Laudo de avaliação', planta: 'Planta', outro: 'Documento',
};

async function runDocumentExpiryCheck(io) {
  const docsSvc = require('../modules/properties/documents.service');
  const docs = await docsSvc.findExpiringSoon();

  for (const doc of docs) {
    try {
      const daysLeft = Math.ceil((new Date(doc.expires_at) - Date.now()) / (1000 * 60 * 60 * 24));
      const label    = DOC_CATEGORY_LABELS[doc.category] || 'Documento';
      const status   = daysLeft < 0 ? `venceu há ${Math.abs(daysLeft)} dia(s)` : `vence em ${daysLeft} dia(s)`;
      const message  = `${label} de "${doc.property_title}" (${doc.property_code}) ${status}.`;

      const recipients = await query(
        `SELECT DISTINCT user_id FROM workspace_memberships WHERE workspace_id = $1 AND role = 'admin'
         UNION
         SELECT $2::uuid WHERE $2::uuid IS NOT NULL`,
        [doc.workspace_id, doc.broker_id]
      );

      for (const rec of recipients.rows) {
        if (!rec.user_id) continue;
        await notifSvc.create({
          workspaceId: doc.workspace_id,
          userId:      rec.user_id,
          type:        'document_expiring',
          title:       'Documento a vencer',
          message,
        }, io);
      }

      await docsSvc.markNotified(doc.id);
    } catch (err) {
      logger.warn('Document expiry notification failed', { documentId: doc.id, err: err.message });
    }
  }
}

// ── Schedule jobs ──────────────────────────────────────────────────────────

function startJobs(io) {
  // 30-minute follow-up — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runFollowUp('30min').catch(err => logger.error('followUp 30min error', { err: err.message }));
  });

  // 1-day follow-up — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runFollowUp('1day').catch(err => logger.error('followUp 1day error', { err: err.message }));
  });

  // 3-day follow-up — every hour
  cron.schedule('0 * * * *', () => {
    runFollowUp('3day').catch(err => logger.error('followUp 3day error', { err: err.message }));
  });

  // Backfill: move deals respondidos para "Em Atendimento" — a cada 5 min
  cron.schedule('*/5 * * * *', () => {
    backfillAttending().catch(err => logger.error('Backfill attending error', { err: err.message }));
  });

  // AI analysis — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runAiAnalysis()
      .catch(err => logger.error('AI analysis error', { err: err.message }));
  });

  // SLA breach check — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runSlaCheck(io).catch(err => logger.error('SLA check error', { err: err.message }));
  });

  // Stale lead check (lead sem retorno) — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runStaleLeadCheck(io).catch(err => logger.error('Stale lead check error', { err: err.message }));
  });

  // Ticket reminders — every minute
  cron.schedule('* * * * *', () => {
    runTicketReminders().catch(err => logger.error('Ticket reminders error', { err: err.message }));
  });

  // Recurring tickets spawner — every day at 06:00
  cron.schedule('0 6 * * *', () => {
    runRecurringTickets().catch(err => logger.error('Recurring tickets error', { err: err.message }));
  });

  // Ticket due-today emails — every day at 08:00 BRT (11:00 UTC)
  cron.schedule('0 11 * * *', () => {
    runTicketDueSoon().catch(err => logger.error('Ticket due-soon error', { err: err.message }));
  });

  // Daily digest email — every day at 07:00 BRT (10:00 UTC)
  cron.schedule('0 10 * * *', () => {
    const notif = require('../services/ticket-notifications');
    notif.sendDailyDigests()
      .then(() => logger.info('Daily digests sent'))
      .catch(err => logger.error('Daily digest error', { err: err.message }));
  });

  // Scheduled broadcasts — every minute
  const broadcastSvc = require('../modules/broadcasts/broadcasts.service');
  cron.schedule('* * * * *', () => {
    broadcastSvc.runScheduledBroadcasts().catch(err => logger.error('Scheduled broadcasts error', { err: err.message }));
  });

  // Auto-encerramento 24h após último contato humano sem resposta — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runAutoClose(io).catch(err => logger.error('Auto-close error', { err: err.message }));
  });

  // Expiração de reservas de lotes/imóveis — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runExpireReservations().catch(err => logger.error('Expire reservations error', { err: err.message }));
  });

  // Vencimento de documentos do cofre — every day at 07:00 BRT (10:00 UTC)
  cron.schedule('0 10 * * *', () => {
    runDocumentExpiryCheck(io).catch(err => logger.error('Document expiry check error', { err: err.message }));
  });

  // Expiração de propostas de empreendimentos — every 15 minutes
  const proposalsSvc = require('../modules/developments/development-proposals.service');
  cron.schedule('*/15 * * * *', () => {
    proposalsSvc.expire().catch(err => logger.error('Expire development proposals error', { err: err.message }));
  });

  // Sincronização automática de feeds de imóveis — every hour
  cron.schedule('0 * * * *', () => {
    const importSvc = require('../modules/imports/imports.service');
    importSvc.runDueFeeds().catch(err => logger.error('Feed sync error', { err: err.message }));
  });

  logger.info('Background jobs started (follow-up + AI analysis + SLA check + auto-close + stale lead alerts + ticket reminders + scheduled broadcasts + reservation expiry + document expiry + development proposals expiry + feed sync)');
}

module.exports = { startJobs, backfillAttending, runExpireReservations, runDocumentExpiryCheck, runAutoClose };
