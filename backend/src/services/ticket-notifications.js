'use strict';

const { query }  = require('../config/database');
const { sendMailSilent: sendMail, tplAssigned, tplComment, tplMention, tplStatusChanged, tplDueDateChanged, tplDueSoon, tplDailyDigest } = require('./mail');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ticketUrl(workspaceId, boardId, ticketId) {
  return `${APP_URL}/dashboard/tickets/${boardId}/${ticketId}`;
}

async function getTicketMeta(ticketId) {
  const r = await query(
    `SELECT t.id, t.title, t.assignee_id, t.created_by, t.priority, t.due_date,
            tb.id AS board_id, tb.name AS board_name, tb.workspace_id
     FROM tickets t
     JOIN ticket_boards tb ON tb.id = t.board_id
     WHERE t.id = $1`,
    [ticketId]
  );
  return r.rows[0] || null;
}

async function getUserInfo(userId) {
  if (!userId) return null;
  const r = await query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
  return r.rows[0] || null;
}

/**
 * Retorna todos os participantes do ticket (assignee + criador + comentaristas),
 * excluindo o actorId, deduplicados por email.
 */
async function getParticipants(ticketId, actorId) {
  const r = await query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     JOIN (
       SELECT assignee_id AS user_id FROM tickets WHERE id = $1 AND assignee_id IS NOT NULL
       UNION
       SELECT created_by FROM tickets WHERE id = $1 AND created_by IS NOT NULL
       UNION
       SELECT user_id FROM ticket_comments WHERE ticket_id = $1 AND user_id IS NOT NULL
     ) p ON p.user_id = u.id
     WHERE u.id != $2
       AND u.email IS NOT NULL
       AND u.email != ''`,
    [ticketId, actorId]
  );
  return r.rows;
}

// ── Notificações ──────────────────────────────────────────────────────────────

/**
 * Dispara quando um ticket é atribuído a alguém.
 * Envia apenas para o novo assignee (exceto se ele mesmo é o actor).
 */
async function notifyAssigned(ticketId, newAssigneeId, actorId) {
  if (!newAssigneeId || newAssigneeId === actorId) return;
  try {
    const [ticket, assignee, actor] = await Promise.all([
      getTicketMeta(ticketId),
      getUserInfo(newAssigneeId),
      getUserInfo(actorId),
    ]);
    if (!ticket || !assignee?.email) return;

    await sendMail({
      to:      assignee.email,
      subject: `[GTW] Ticket atribuído a você: ${ticket.title}`,
      html:    tplAssigned({
        assigneeName: assignee.name,
        actorName:    actor?.name || 'Alguém',
        ticketTitle:  ticket.title,
        boardName:    ticket.board_name,
        priority:     ticket.priority,
        ticketUrl:    ticketUrl(ticket.workspace_id, ticket.board_id, ticketId),
      }),
    });
  } catch (err) {
    console.error('[ticket-notifications] notifyAssigned:', err.message);
  }
}

/**
 * Dispara quando um comentário é criado.
 * Envia para todos os participantes exceto o comentarista.
 */
async function notifyComment(ticketId, commenterId, commentContent) {
  try {
    const [ticket, actor, participants] = await Promise.all([
      getTicketMeta(ticketId),
      getUserInfo(commenterId),
      getParticipants(ticketId, commenterId),
    ]);
    if (!ticket || !participants.length) return;

    await Promise.all(participants.map((p) =>
      sendMail({
        to:      p.email,
        subject: `[GTW] Novo comentário no ticket: ${ticket.title}`,
        html:    tplComment({
          recipientName:  p.name,
          actorName:      actor?.name || 'Alguém',
          ticketTitle:    ticket.title,
          boardName:      ticket.board_name,
          commentContent: commentContent || '',
          ticketUrl:      ticketUrl(ticket.workspace_id, ticket.board_id, ticketId),
        }),
      })
    ));
  } catch (err) {
    console.error('[ticket-notifications] notifyComment:', err.message);
  }
}

/**
 * Dispara quando a coluna (status) do ticket é alterada.
 * Envia para todos os participantes exceto o actor.
 */
async function notifyStatusChanged(ticketId, actorId, columnId) {
  try {
    const [ticket, actor, participants, colR] = await Promise.all([
      getTicketMeta(ticketId),
      getUserInfo(actorId),
      getParticipants(ticketId, actorId),
      query('SELECT name FROM ticket_columns WHERE id = $1', [columnId]),
    ]);
    if (!ticket || !participants.length) return;
    const columnName = colR.rows[0]?.name || 'Nova coluna';

    await Promise.all(participants.map((p) =>
      sendMail({
        to:      p.email,
        subject: `[GTW] Status atualizado: ${ticket.title}`,
        html:    tplStatusChanged({
          actorName:   actor?.name || 'Alguém',
          ticketTitle: ticket.title,
          boardName:   ticket.board_name,
          columnName,
          ticketUrl:   ticketUrl(ticket.workspace_id, ticket.board_id, ticketId),
        }),
      })
    ));
  } catch (err) {
    console.error('[ticket-notifications] notifyStatusChanged:', err.message);
  }
}

/**
 * Dispara quando a data de entrega do ticket é alterada.
 * Envia para todos os participantes exceto o actor.
 */
async function notifyDueDateChanged(ticketId, actorId, dueDate) {
  try {
    const [ticket, actor, participants] = await Promise.all([
      getTicketMeta(ticketId),
      getUserInfo(actorId),
      getParticipants(ticketId, actorId),
    ]);
    if (!ticket || !participants.length) return;

    await Promise.all(participants.map((p) =>
      sendMail({
        to:      p.email,
        subject: `[GTW] Prazo atualizado: ${ticket.title}`,
        html:    tplDueDateChanged({
          actorName:   actor?.name || 'Alguém',
          ticketTitle: ticket.title,
          boardName:   ticket.board_name,
          dueDate,
          ticketUrl:   ticketUrl(ticket.workspace_id, ticket.board_id, ticketId),
        }),
      })
    ));
  } catch (err) {
    console.error('[ticket-notifications] notifyDueDateChanged:', err.message);
  }
}

/**
 * Notifica usuários mencionados com @Nome no conteúdo do comentário.
 * Extrai nomes do padrão @Nome, busca por email no workspace e envia
 * apenas para quem ainda não foi notificado pelo notifyComment.
 */
async function notifyMentions(ticketId, workspaceId, commenterId, content) {
  if (!content) return;
  try {
    // Normaliza para lowercase — comparação case-insensitive
    const mentions = [...content.matchAll(/@([^\s@]+(?:\s[^\s@]+)*)/g)]
      .map(m => m[1].trim().toLowerCase())
      .filter(Boolean);
    if (!mentions.length) return;

    const [ticket, actor] = await Promise.all([
      getTicketMeta(ticketId),
      getUserInfo(commenterId),
    ]);
    if (!ticket) return;

    // Busca por nome (case-insensitive) OU pela parte do email antes do @
    // para cobrir usuários que nunca editaram o perfil
    const placeholders = mentions.map((_, i) => `$${i + 2}`).join(', ');
    const r = await query(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       JOIN workspace_memberships wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1
         AND (
           LOWER(u.name) = ANY(ARRAY[${placeholders}])
           OR LOWER(SPLIT_PART(u.email, '@', 1)) = ANY(ARRAY[${placeholders}])
         )
         AND u.id != $${mentions.length + 2}
         AND u.email IS NOT NULL`,
      [workspaceId, ...mentions, commenterId]
    );

    await Promise.all(r.rows.map(u =>
      sendMail({
        to:      u.email,
        subject: `[GTW] Você foi mencionado: ${ticket.title}`,
        html:    tplMention({
          mentionedName:  u.name,
          actorName:      actor?.name || 'Alguém',
          ticketTitle:    ticket.title,
          boardName:      ticket.board_name,
          commentContent: content,
          ticketUrl:      ticketUrl(ticket.workspace_id, ticket.board_id, ticketId),
        }),
      })
    ));
  } catch (err) {
    console.error('[ticket-notifications] notifyMentions:', err.message);
  }
}

/**
 * Disparado pelo cron diário quando o prazo do ticket é hoje.
 * Envia apenas para o assignee.
 */
async function notifyDueSoon(ticketId) {
  try {
    const ticket = await getTicketMeta(ticketId);
    if (!ticket?.assignee_id) return;
    const assignee = await getUserInfo(ticket.assignee_id);
    if (!assignee?.email) return;

    await sendMail({
      to:      assignee.email,
      subject: `[GTW] Prazo hoje: ${ticket.title}`,
      html:    tplDueSoon({
        assigneeName: assignee.name,
        ticketTitle:  ticket.title,
        boardName:    ticket.board_name,
        dueDate:      ticket.due_date,
        ticketUrl:    ticketUrl(ticket.workspace_id, ticket.board_id, ticketId),
      }),
    });
  } catch (err) {
    console.error('[ticket-notifications] notifyDueSoon:', err.message);
  }
}

/**
 * Envia o digest diário para todos os usuários ativos com tickets pendentes.
 * Chamado pelo cron às 07:00 BRT (10:00 UTC).
 * Cada usuário recebe um único e-mail consolidado com:
 *   - Tickets atrasados (due_date < hoje, não resolvidos)
 *   - Tickets vencendo hoje
 *   - Lembretes com remind_at hoje
 *   - Tickets vencendo nos próximos 3 dias
 */
async function sendDailyDigests() {
  // Coleta todos os usuários que têm algo pendente hoje
  const usersRes = await query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     WHERE u.email IS NOT NULL AND u.email != ''
       AND (
         EXISTS (
           SELECT 1 FROM tickets t
           JOIN ticket_boards tb ON tb.id = t.board_id
           WHERE t.assignee_id = u.id
             AND t.resolved_at IS NULL
             AND NOT tb.is_archived
             AND t.due_date IS NOT NULL
             AND (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date
                 <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date + 3
         )
         OR EXISTS (
           SELECT 1 FROM ticket_reminders tr
           JOIN tickets t ON t.id = tr.ticket_id
           JOIN ticket_boards tb ON tb.id = t.board_id
           WHERE tr.user_id = u.id AND NOT tr.sent
             AND (tr.remind_at AT TIME ZONE 'America/Sao_Paulo')::date
                 = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
             AND NOT tb.is_archived
         )
       )`
  );

  const todayBRT  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayDate = todayBRT.toISOString().slice(0, 10);

  const dateLabel = todayBRT.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo',
  });
  // Capitaliza primeiro caractere
  const dateLabelFmt = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  for (const user of usersRes.rows) {
    try {
      // Tickets atrasados (venceram antes de hoje)
      const overdueRes = await query(
        `SELECT t.id, t.title, t.priority, t.due_date,
                tb.id AS board_id, tb.name AS board_name
         FROM tickets t
         JOIN ticket_boards tb ON tb.id = t.board_id
         WHERE t.assignee_id = $1
           AND t.resolved_at IS NULL
           AND NOT tb.is_archived
           AND t.due_date IS NOT NULL
           AND (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date < $2::date
         ORDER BY t.due_date ASC
         LIMIT 10`,
        [user.id, todayDate]
      );

      // Tickets vencendo hoje
      const dueTodayRes = await query(
        `SELECT t.id, t.title, t.priority, t.due_date,
                tb.id AS board_id, tb.name AS board_name
         FROM tickets t
         JOIN ticket_boards tb ON tb.id = t.board_id
         WHERE t.assignee_id = $1
           AND t.resolved_at IS NULL
           AND NOT tb.is_archived
           AND (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
         ORDER BY t.due_date ASC`,
        [user.id, todayDate]
      );

      // Próximos 3 dias (excluindo hoje)
      const upcomingRes = await query(
        `SELECT t.id, t.title, t.priority, t.due_date,
                tb.id AS board_id, tb.name AS board_name
         FROM tickets t
         JOIN ticket_boards tb ON tb.id = t.board_id
         WHERE t.assignee_id = $1
           AND t.resolved_at IS NULL
           AND NOT tb.is_archived
           AND (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date > $2::date
           AND (t.due_date AT TIME ZONE 'America/Sao_Paulo')::date <= $2::date + 3
         ORDER BY t.due_date ASC`,
        [user.id, todayDate]
      );

      // Lembretes de hoje
      const remindersRes = await query(
        `SELECT tr.id, tr.remind_at, tr.message,
                t.title AS ticket_title,
                tb.id AS board_id, tb.name AS board_name
         FROM ticket_reminders tr
         JOIN tickets t ON t.id = tr.ticket_id
         JOIN ticket_boards tb ON tb.id = t.board_id
         WHERE tr.user_id = $1
           AND NOT tr.sent
           AND (tr.remind_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
           AND NOT tb.is_archived
         ORDER BY tr.remind_at ASC`,
        [user.id, todayDate]
      );

      const dueToday  = dueTodayRes.rows;
      const overdue   = overdueRes.rows;
      const upcoming  = upcomingRes.rows;
      const reminders = remindersRes.rows;

      if (!dueToday.length && !overdue.length && !upcoming.length && !reminders.length) continue;

      await sendMail({
        to:      user.email,
        subject: `[GTW] Agenda do dia — ${dateLabelFmt}`,
        html:    tplDailyDigest({
          userName: user.name,
          dueToday,
          overdue,
          upcoming,
          reminders,
          appUrl:    APP_URL,
          dateLabel: dateLabelFmt,
        }),
      });
    } catch (err) {
      console.error(`[ticket-notifications] sendDailyDigests user=${user.id}:`, err.message);
    }
  }
}

module.exports = {
  notifyAssigned,
  notifyComment,
  notifyMentions,
  notifyStatusChanged,
  notifyDueDateChanged,
  notifyDueSoon,
  sendDailyDigests,
};
