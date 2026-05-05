'use strict';

const { query }  = require('../config/database');
const { sendMailSilent: sendMail, tplAssigned, tplComment, tplMention, tplStatusChanged, tplDueDateChanged } = require('./mail');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ticketUrl(workspaceId, boardId, ticketId) {
  return `${APP_URL}/dashboard/tickets/${boardId}?ticket=${ticketId}`;
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
    const mentions = [...content.matchAll(/@([^\s@]+(?:\s[^\s@]+)*)/g)].map(m => m[1]);
    if (!mentions.length) return;

    const [ticket, actor] = await Promise.all([
      getTicketMeta(ticketId),
      getUserInfo(commenterId),
    ]);
    if (!ticket) return;

    // Busca usuários pelo nome no workspace (exclui o próprio comentarista)
    const placeholders = mentions.map((_, i) => `$${i + 2}`).join(', ');
    const r = await query(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       JOIN workspace_memberships wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1
         AND u.name = ANY(ARRAY[${placeholders}])
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

module.exports = {
  notifyAssigned,
  notifyComment,
  notifyMentions,
  notifyStatusChanged,
  notifyDueDateChanged,
};
