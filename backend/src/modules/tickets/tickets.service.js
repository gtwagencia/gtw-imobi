'use strict';

const { query } = require('../../config/database');
const notif     = require('../../services/ticket-notifications');
const gcal      = require('../../services/google-calendar.service');

// ── Workspace toggle ──────────────────────────────────────────────────────────

async function isTicketsEnabled(workspaceId) {
  const r = await query('SELECT tickets_enabled FROM workspaces WHERE id = $1', [workspaceId]);
  return r.rows[0]?.tickets_enabled === true;
}

async function setTicketsEnabled(workspaceId, enabled) {
  await query('UPDATE workspaces SET tickets_enabled = $1 WHERE id = $2', [enabled, workspaceId]);
}

// ── Boards ────────────────────────────────────────────────────────────────────

async function listBoards(workspaceId, userId) {
  // Show boards where user is creator OR board member, OR user is workspace admin
  const r = await query(
    `SELECT tb.*,
            u.name  AS created_by_name,
            tbm.role AS user_role,
            COUNT(DISTINCT tc.id)::int AS column_count,
            COUNT(DISTINCT t.id)::int  AS ticket_count
     FROM ticket_boards tb
     LEFT JOIN users u ON u.id = tb.created_by
     LEFT JOIN ticket_board_members tbm ON tbm.board_id = tb.id AND tbm.user_id = $2
     LEFT JOIN ticket_columns tc ON tc.board_id = tb.id
     LEFT JOIN tickets t ON t.board_id = tb.id
     WHERE tb.workspace_id = $1
       AND NOT tb.is_archived
       AND (tb.created_by = $2 OR tbm.user_id = $2)
     GROUP BY tb.id, u.name, tbm.role
     ORDER BY tb.created_at DESC`,
    [workspaceId, userId]
  );
  return r.rows;
}

async function listAllBoards(workspaceId) {
  // Admin view — all boards
  const r = await query(
    `SELECT tb.*,
            u.name  AS created_by_name,
            COUNT(DISTINCT tc.id)::int AS column_count,
            COUNT(DISTINCT t.id)::int  AS ticket_count
     FROM ticket_boards tb
     LEFT JOIN users u ON u.id = tb.created_by
     LEFT JOIN ticket_columns tc ON tc.board_id = tb.id
     LEFT JOIN tickets t ON t.board_id = tb.id
     WHERE tb.workspace_id = $1 AND NOT tb.is_archived
     GROUP BY tb.id, u.name
     ORDER BY tb.created_at DESC`,
    [workspaceId]
  );
  return r.rows;
}

async function createBoard(workspaceId, userId, { name, description, color }) {
  const r = await query(
    `INSERT INTO ticket_boards (workspace_id, name, description, color, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [workspaceId, name, description || null, color || '#6366f1', userId]
  );
  const board = r.rows[0];

  // Add creator as manager
  await query(
    `INSERT INTO ticket_board_members (board_id, user_id, role) VALUES ($1,$2,'manager')
     ON CONFLICT (board_id, user_id) DO NOTHING`,
    [board.id, userId]
  );

  // Seed default columns
  const defaultColumns = [
    { name: 'A Fazer',      color: '#6366f1', position: 0, is_done: false },
    { name: 'Em Progresso', color: '#f97316', position: 1, is_done: false },
    { name: 'Em Revisão',   color: '#eab308', position: 2, is_done: false },
    { name: 'Concluído',    color: '#22c55e', position: 3, is_done: true  },
  ];
  for (const col of defaultColumns) {
    await query(
      `INSERT INTO ticket_columns (board_id, name, color, position, is_done) VALUES ($1,$2,$3,$4,$5)`,
      [board.id, col.name, col.color, col.position, col.is_done]
    );
  }

  return board;
}

async function getBoard(boardId, workspaceId) {
  const r = await query(
    `SELECT tb.*, u.name AS created_by_name
     FROM ticket_boards tb
     LEFT JOIN users u ON u.id = tb.created_by
     WHERE tb.id = $1 AND tb.workspace_id = $2`,
    [boardId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Board não encontrado'), { status: 404 });
  const board = r.rows[0];

  // Load columns
  const colsR = await query(
    `SELECT * FROM ticket_columns WHERE board_id = $1 ORDER BY position`,
    [boardId]
  );
  board.columns = colsR.rows;

  // Load tickets with assignee + labels
  const ticketsR = await query(
    `SELECT t.*,
            u.name       AS assignee_name,
            u.avatar_url AS assignee_avatar,
            cb.name      AS created_by_name,
            COALESCE(
              json_agg(
                json_build_object('id', tl.id, 'name', tl.name, 'color', tl.color)
              ) FILTER (WHERE tl.id IS NOT NULL),
              '[]'
            ) AS labels,
            COALESCE(SUM(ttl.duration_seconds), 0)::int AS total_time_seconds
     FROM tickets t
     LEFT JOIN users u   ON u.id  = t.assignee_id
     LEFT JOIN users cb  ON cb.id = t.created_by
     LEFT JOIN ticket_ticket_labels ttlbl ON ttlbl.ticket_id = t.id
     LEFT JOIN ticket_labels tl ON tl.id = ttlbl.label_id
     LEFT JOIN ticket_time_logs ttl ON ttl.ticket_id = t.id
     WHERE t.board_id = $1
     GROUP BY t.id, u.name, u.avatar_url, cb.name
     ORDER BY t.position, t.created_at`,
    [boardId]
  );

  // Group by column
  board.columns = board.columns.map(col => ({
    ...col,
    tickets: ticketsR.rows.filter(t => t.column_id === col.id),
  }));

  return board;
}

/**
 * Duplica um board: cria um novo com as mesmas colunas e tickets do board de origem.
 * Tickets copiados perdem assignee, time logs e datas — preservam estrutura/título.
 */
async function duplicateBoard(boardId, workspaceId, userId, newName) {
  // Carrega o board original com colunas e tickets
  const boardRes = await query(
    `SELECT * FROM ticket_boards WHERE id = $1 AND workspace_id = $2`,
    [boardId, workspaceId]
  );
  if (!boardRes.rows.length) throw Object.assign(new Error('Board não encontrado'), { status: 404 });
  const source = boardRes.rows[0];

  const colsRes = await query(
    `SELECT * FROM ticket_columns WHERE board_id = $1 ORDER BY position`,
    [boardId]
  );
  const sourceCols = colsRes.rows;

  // Cria o novo board
  const name = newName || `${source.name} (cópia)`;
  const newBoardRes = await query(
    `INSERT INTO ticket_boards (workspace_id, name, description, color, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [workspaceId, name, source.description || null, source.color, userId]
  );
  const newBoard = newBoardRes.rows[0];

  // Criador como manager
  await query(
    `INSERT INTO ticket_board_members (board_id, user_id, role) VALUES ($1,$2,'manager')
     ON CONFLICT (board_id, user_id) DO NOTHING`,
    [newBoard.id, userId]
  );

  // Copia colunas e tickets de cada coluna
  for (const col of sourceCols) {
    const newColRes = await query(
      `INSERT INTO ticket_columns (board_id, name, color, position, is_done)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newBoard.id, col.name, col.color, col.position, col.is_done]
    );
    const newCol = newColRes.rows[0];

    // Copia tickets desta coluna (sem assignee, sem time logs, sem datas reais)
    const ticketsRes = await query(
      `SELECT * FROM tickets WHERE column_id = $1 ORDER BY position`,
      [col.id]
    );
    for (let i = 0; i < ticketsRes.rows.length; i++) {
      const t = ticketsRes.rows[i];
      await query(
        `INSERT INTO tickets
           (board_id, column_id, title, description, priority, position,
            estimated_hours, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newBoard.id, newCol.id, t.title, t.description, t.priority, i,
         t.estimated_hours || null, userId]
      );
    }
  }

  return newBoard;
}

async function updateBoard(boardId, workspaceId, body) {
  const { name, description, color, isArchived } = body;
  const map = { name: 'name', description: 'description', color: 'color', isArchived: 'is_archived' };
  const fields = []; const vals = []; let idx = 1;
  for (const [k, col] of Object.entries(map)) {
    if (k in body) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });
  vals.push(boardId, workspaceId);
  const r = await query(
    `UPDATE ticket_boards SET ${fields.join(', ')} WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Board não encontrado'), { status: 404 });
  return r.rows[0];
}

async function archiveBoard(boardId, workspaceId) {
  await query(
    `UPDATE ticket_boards SET is_archived = true WHERE id = $1 AND workspace_id = $2`,
    [boardId, workspaceId]
  );
}

// ── Board members ─────────────────────────────────────────────────────────────

async function listBoardMembers(boardId) {
  const r = await query(
    `SELECT tbm.*, u.name, u.email, u.avatar_url
     FROM ticket_board_members tbm
     JOIN users u ON u.id = tbm.user_id
     WHERE tbm.board_id = $1
     ORDER BY u.name`,
    [boardId]
  );
  return r.rows;
}

async function addBoardMember(boardId, userId, role = 'member') {
  await query(
    `INSERT INTO ticket_board_members (board_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (board_id, user_id) DO UPDATE SET role = $3`,
    [boardId, userId, role]
  );
  // Retorna com dados do usuário para o frontend não quebrar ao acessar .name
  const r = await query(
    `SELECT tbm.user_id, tbm.role, tbm.board_id,
            u.name, u.email, u.avatar_url
     FROM ticket_board_members tbm
     JOIN users u ON u.id = tbm.user_id
     WHERE tbm.board_id = $1 AND tbm.user_id = $2`,
    [boardId, userId]
  );
  return r.rows[0];
}

async function updateBoardMemberRole(boardId, userId, role) {
  const r = await query(
    `UPDATE ticket_board_members SET role = $3 WHERE board_id = $1 AND user_id = $2 RETURNING *`,
    [boardId, userId, role]
  );
  if (!r.rows.length) throw Object.assign(new Error('Membro não encontrado'), { status: 404 });
  return r.rows[0];
}

async function getBoardMemberRole(boardId, userId) {
  const r = await query(
    `SELECT role FROM ticket_board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
  return r.rows[0]?.role || null; // null = não é membro
}

async function removeBoardMember(boardId, userId) {
  await query(
    `DELETE FROM ticket_board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
}

async function getBoardRole(boardId, userId) {
  const r = await query(
    `SELECT role FROM ticket_board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, userId]
  );
  return r.rows[0]?.role || null;
}

// ── Columns ───────────────────────────────────────────────────────────────────

async function createColumn(boardId, { name, color, position, isDone }) {
  const r = await query(
    `INSERT INTO ticket_columns (board_id, name, color, position, is_done)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [boardId, name, color || '#6366f1', position ?? 99, isDone ?? false]
  );
  return r.rows[0];
}

async function updateColumn(columnId, boardId, { name, color, position, isDone }) {
  const map = { name: 'name', color: 'color', position: 'position', isDone: 'is_done' };
  const fields = []; const vals = []; let idx = 1;
  const body = { name, color, position, isDone };
  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });
  vals.push(columnId, boardId);
  const r = await query(
    `UPDATE ticket_columns SET ${fields.join(', ')} WHERE id = $${idx} AND board_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Coluna não encontrada'), { status: 404 });
  return r.rows[0];
}

async function reorderColumns(boardId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      `UPDATE ticket_columns SET position = $1 WHERE id = $2 AND board_id = $3`,
      [i, orderedIds[i], boardId]
    );
  }
}

async function deleteColumn(columnId, boardId) {
  // Move tickets to first remaining column
  const firstCol = await query(
    `SELECT id FROM ticket_columns WHERE board_id = $1 AND id != $2 ORDER BY position LIMIT 1`,
    [boardId, columnId]
  );
  if (firstCol.rows.length) {
    await query(
      `UPDATE tickets SET column_id = $1 WHERE column_id = $2`,
      [firstCol.rows[0].id, columnId]
    );
  }
  await query(`DELETE FROM ticket_columns WHERE id = $1 AND board_id = $2`, [columnId, boardId]);
}

// ── Tickets ───────────────────────────────────────────────────────────────────

async function createTicket(boardId, userId, { columnId, title, description, assigneeId, priority, dueDate, estimatedHours, conversationId, contactId, contactName, labelIds }) {
  // Get max position in column
  const posR = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM tickets WHERE column_id = $1`,
    [columnId]
  );
  const position = posR.rows[0].next_pos;

  const r = await query(
    `INSERT INTO tickets (board_id, column_id, title, description, assignee_id, created_by, priority, due_date, position, estimated_hours, conversation_id, contact_id, contact_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [boardId, columnId, title, description || null, assigneeId || null, userId, priority || 'medium',
     dueDate || null, position, estimatedHours || null, conversationId || null, contactId || null, contactName || null]
  );
  const ticket = r.rows[0];

  // Attach labels
  if (labelIds?.length) {
    for (const labelId of labelIds) {
      await query(
        `INSERT INTO ticket_ticket_labels (ticket_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [ticket.id, labelId]
      );
    }
  }

  // Garante que o campo labels sempre existe (evita crash no frontend ao acessar .length)
  ticket.labels = [];

  // Sincroniza com Google Calendar do assignee em background
  if (ticket.assignee_id && ticket.due_date) {
    gcal.createEvent(ticket.assignee_id, ticket.id, {
      title:       ticket.title,
      description: ticket.description,
      dueDate:     ticket.due_date,
    }).catch(err => console.error('[gcal-sync] createTicket:', err.message));
  }

  return ticket;
}

async function getTicket(ticketId, workspaceId) {
  const r = await query(
    `SELECT t.*,
            u.name       AS assignee_name,
            u.avatar_url AS assignee_avatar,
            cb.name      AS created_by_name,
            COALESCE(
              json_agg(
                json_build_object('id', tl.id, 'name', tl.name, 'color', tl.color)
              ) FILTER (WHERE tl.id IS NOT NULL),
              '[]'
            ) AS labels,
            COALESCE(SUM(ttl.duration_seconds), 0)::int AS total_time_seconds,
            tb.workspace_id
     FROM tickets t
     JOIN ticket_boards tb ON tb.id = t.board_id
     LEFT JOIN users u   ON u.id  = t.assignee_id
     LEFT JOIN users cb  ON cb.id = t.created_by
     LEFT JOIN ticket_ticket_labels ttlbl ON ttlbl.ticket_id = t.id
     LEFT JOIN ticket_labels tl ON tl.id = ttlbl.label_id
     LEFT JOIN ticket_time_logs ttl ON ttl.ticket_id = t.id
     WHERE t.id = $1 AND tb.workspace_id = $2
     GROUP BY t.id, u.name, u.avatar_url, cb.name, tb.workspace_id`,
    [ticketId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Ticket não encontrado'), { status: 404 });
  return r.rows[0];
}

async function updateTicket(ticketId, workspaceId, body, actorId) {
  // Lê estado anterior para decidir o sync do Google Calendar
  const prevR = await query(
    'SELECT assignee_id, due_date, title, description FROM tickets WHERE id = $1',
    [ticketId]
  );
  const prev = prevR.rows[0] || {};

  const map = {
    columnId:       'column_id',
    title:          'title',
    description:    'description',
    assigneeId:     'assignee_id',
    contactName:    'contact_name',
    contactId:      'contact_id',
    priority:       'priority',
    dueDate:        'due_date',
    position:       'position',
    estimatedHours: 'estimated_hours',
    isRecurring:    'is_recurring',
    recurrenceType: 'recurrence_type',
    recurrenceInterval: 'recurrence_interval',
    recurrenceEnd:  'recurrence_end',
    resolvedAt:     'resolved_at',
  };
  const fields = []; const vals = []; let idx = 1;
  for (const [k, col] of Object.entries(map)) {
    if (k in body) { fields.push(`${col} = $${idx++}`); vals.push(body[k] ?? null); }
  }
  if (!fields.length && !body.labelIds) throw Object.assign(new Error('Nenhum campo'), { status: 400 });

  if (fields.length) {
    vals.push(ticketId, workspaceId);
    const r = await query(
      `UPDATE tickets t SET ${fields.join(', ')}
       FROM ticket_boards tb
       WHERE t.id = $${idx} AND t.board_id = tb.id AND tb.workspace_id = $${idx + 1}
       RETURNING t.*`,
      vals
    );
    if (!r.rows.length) throw Object.assign(new Error('Ticket não encontrado'), { status: 404 });

    // Auto-set resolved_at when moving to a "done" column
    if (body.columnId) {
      const colR = await query(`SELECT is_done FROM ticket_columns WHERE id = $1`, [body.columnId]);
      if (colR.rows[0]?.is_done) {
        await query(`UPDATE tickets SET resolved_at = NOW() WHERE id = $1 AND resolved_at IS NULL`, [ticketId]);
      }
    }
  }

  // Update labels if provided
  if (body.labelIds !== undefined) {
    await query(`DELETE FROM ticket_ticket_labels WHERE ticket_id = $1`, [ticketId]);
    for (const labelId of (body.labelIds || [])) {
      await query(
        `INSERT INTO ticket_ticket_labels (ticket_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [ticketId, labelId]
      );
    }
  }

  const updated = await getTicket(ticketId, workspaceId);

  // Dispara notificações em background (não bloqueia a resposta)
  if (actorId) {
    if (body.assigneeId)       notif.notifyAssigned(ticketId, body.assigneeId, actorId);
    if (body.columnId)         notif.notifyStatusChanged(ticketId, actorId, body.columnId);
    if ('dueDate' in body)     notif.notifyDueDateChanged(ticketId, actorId, body.dueDate);
  }

  // Sincroniza Google Calendar em background
  const newAssigneeId = 'assigneeId' in body ? (body.assigneeId || null) : prev.assignee_id;
  const newDueDate    = 'dueDate'    in body ? (body.dueDate    || null) : prev.due_date;
  const newTitle      = body.title       ?? prev.title;
  const newDesc       = body.description ?? prev.description;

  const assigneeChanged = 'assigneeId'  in body && body.assigneeId  !== prev.assignee_id;
  const dueDateChanged  = 'dueDate'     in body;
  const titleChanged    = body.title       !== undefined;
  const descChanged     = body.description !== undefined;

  if (assigneeChanged) {
    // Remove evento do assignee anterior
    if (prev.assignee_id) {
      gcal.deleteEvent(prev.assignee_id, ticketId)
        .catch(err => console.error('[gcal-sync] deleteEvent (old assignee):', err.message));
    }
    // Cria evento para o novo assignee
    if (newAssigneeId && newDueDate) {
      gcal.createEvent(newAssigneeId, ticketId, { title: newTitle, description: newDesc, dueDate: newDueDate })
        .catch(err => console.error('[gcal-sync] createEvent (new assignee):', err.message));
    }
  } else if ((dueDateChanged || titleChanged || descChanged) && newAssigneeId) {
    if (newDueDate) {
      gcal.updateEvent(newAssigneeId, ticketId, { title: newTitle, description: newDesc, dueDate: newDueDate })
        .catch(err => console.error('[gcal-sync] updateEvent:', err.message));
    } else {
      // Prazo removido — deleta o evento
      gcal.deleteEvent(newAssigneeId, ticketId)
        .catch(err => console.error('[gcal-sync] deleteEvent (no due date):', err.message));
    }
  }

  return updated;
}

async function deleteTicket(ticketId, workspaceId) {
  // Remove evento do Google Calendar antes de deletar o ticket
  const aR = await query('SELECT assignee_id FROM tickets WHERE id = $1', [ticketId]);
  if (aR.rows[0]?.assignee_id) {
    gcal.deleteEvent(aR.rows[0].assignee_id, ticketId)
      .catch(err => console.error('[gcal-sync] deleteEvent (deleteTicket):', err.message));
  }

  await query(
    `DELETE FROM tickets t USING ticket_boards tb
     WHERE t.id = $1 AND t.board_id = tb.id AND tb.workspace_id = $2`,
    [ticketId, workspaceId]
  );
}

// ── My Tasks (cross-board) ────────────────────────────────────────────────────

async function getMyTasks(workspaceId, userId, { status } = {}) {
  const params = [workspaceId, userId];
  let statusFilter = '';
  if (status === 'open') {
    statusFilter = 'AND t.resolved_at IS NULL';
  } else if (status === 'done') {
    statusFilter = 'AND t.resolved_at IS NOT NULL';
  }

  const r = await query(
    `SELECT t.*,
            tb.name      AS board_name,
            tb.color     AS board_color,
            tc.name      AS column_name,
            tc.color     AS column_color,
            tc.is_done   AS column_is_done,
            COALESCE(SUM(ttl.duration_seconds), 0)::int AS total_time_seconds,
            COALESCE(
              json_agg(
                json_build_object('id', tl.id, 'name', tl.name, 'color', tl.color)
              ) FILTER (WHERE tl.id IS NOT NULL),
              '[]'
            ) AS labels
     FROM tickets t
     JOIN ticket_boards tb ON tb.id = t.board_id
     JOIN ticket_columns tc ON tc.id = t.column_id
     LEFT JOIN ticket_ticket_labels ttlbl ON ttlbl.ticket_id = t.id
     LEFT JOIN ticket_labels tl ON tl.id = ttlbl.label_id
     LEFT JOIN ticket_time_logs ttl ON ttl.ticket_id = t.id
     WHERE tb.workspace_id = $1
       AND t.assignee_id = $2
       AND NOT tb.is_archived
       ${statusFilter}
     GROUP BY t.id, tb.name, tb.color, tc.name, tc.color, tc.is_done
     ORDER BY
       CASE WHEN t.due_date IS NOT NULL THEN 0 ELSE 1 END,
       t.due_date ASC NULLS LAST,
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       t.created_at DESC`,
    params
  );
  return r.rows;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

async function getCalendarTickets(workspaceId, userId, { from, to, myOnly }) {
  const params = [workspaceId, from, to];
  let userFilter = '';
  if (myOnly) { params.push(userId); userFilter = `AND t.assignee_id = $${params.length}`; }

  const r = await query(
    `SELECT t.*,
            tb.name  AS board_name,
            tb.color AS board_color,
            tc.name  AS column_name,
            tc.is_done AS column_is_done,
            u.name   AS assignee_name,
            u.avatar_url AS assignee_avatar
     FROM tickets t
     JOIN ticket_boards tb ON tb.id = t.board_id
     JOIN ticket_columns tc ON tc.id = t.column_id
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE tb.workspace_id = $1
       AND t.due_date BETWEEN $2 AND $3
       AND NOT tb.is_archived
       ${userFilter}
     ORDER BY t.due_date`,
    params
  );
  return r.rows;
}

// ── Time logs ─────────────────────────────────────────────────────────────────

async function getTimeLogs(ticketId) {
  const r = await query(
    `SELECT ttl.*, u.name AS user_name, u.avatar_url AS user_avatar
     FROM ticket_time_logs ttl
     JOIN users u ON u.id = ttl.user_id
     WHERE ttl.ticket_id = $1
     ORDER BY ttl.started_at DESC`,
    [ticketId]
  );
  return r.rows;
}

async function startTimer(ticketId, userId) {
  // Stop any running timer first
  await query(
    `UPDATE ticket_time_logs
     SET ended_at = NOW(),
         duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
     WHERE ticket_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [ticketId, userId]
  );
  const r = await query(
    `INSERT INTO ticket_time_logs (ticket_id, user_id, started_at) VALUES ($1,$2,NOW()) RETURNING *`,
    [ticketId, userId]
  );
  return r.rows[0];
}

async function stopTimer(ticketId, userId) {
  const r = await query(
    `UPDATE ticket_time_logs
     SET ended_at = NOW(),
         duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
     WHERE ticket_id = $1 AND user_id = $2 AND ended_at IS NULL
     RETURNING *`,
    [ticketId, userId]
  );
  return r.rows[0] || null;
}

async function addManualTime(ticketId, userId, { startedAt, endedAt, durationSeconds, note }) {
  const duration = durationSeconds || (endedAt
    ? Math.round((new Date(endedAt) - new Date(startedAt)) / 1000)
    : null);
  const r = await query(
    `INSERT INTO ticket_time_logs (ticket_id, user_id, started_at, ended_at, duration_seconds, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [ticketId, userId, startedAt, endedAt || null, duration, note || null]
  );
  return r.rows[0];
}

async function deleteTimeLog(logId, userId) {
  await query(`DELETE FROM ticket_time_logs WHERE id = $1 AND user_id = $2`, [logId, userId]);
}

async function getActiveTimer(ticketId, userId) {
  const r = await query(
    `SELECT * FROM ticket_time_logs WHERE ticket_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [ticketId, userId]
  );
  return r.rows[0] || null;
}

// ── Reminders ─────────────────────────────────────────────────────────────────

async function listReminders(ticketId) {
  const r = await query(
    `SELECT tr.*, u.name AS user_name FROM ticket_reminders tr
     JOIN users u ON u.id = tr.user_id
     WHERE tr.ticket_id = $1 ORDER BY tr.remind_at`,
    [ticketId]
  );
  return r.rows;
}

async function createReminder(ticketId, userId, { remindAt, message }) {
  const r = await query(
    `INSERT INTO ticket_reminders (ticket_id, user_id, remind_at, message) VALUES ($1,$2,$3,$4) RETURNING *`,
    [ticketId, userId, remindAt, message || null]
  );
  return r.rows[0];
}

async function deleteReminder(reminderId, userId) {
  await query(`DELETE FROM ticket_reminders WHERE id = $1 AND user_id = $2`, [reminderId, userId]);
}

// Get due reminders (for job runner)
async function getDueReminders() {
  const r = await query(
    `SELECT tr.*, t.title AS ticket_title, tb.workspace_id, u.name AS user_name
     FROM ticket_reminders tr
     JOIN tickets t ON t.id = tr.ticket_id
     JOIN ticket_boards tb ON tb.id = t.board_id
     JOIN users u ON u.id = tr.user_id
     WHERE tr.remind_at <= NOW() AND NOT tr.sent`,
  );
  return r.rows;
}

async function markReminderSent(reminderId) {
  await query(`UPDATE ticket_reminders SET sent = true WHERE id = $1`, [reminderId]);
}

// ── Labels ────────────────────────────────────────────────────────────────────

async function listLabels(workspaceId) {
  const r = await query(
    `SELECT * FROM ticket_labels WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId]
  );
  return r.rows;
}

async function createLabel(workspaceId, { name, color }) {
  const r = await query(
    `INSERT INTO ticket_labels (workspace_id, name, color) VALUES ($1,$2,$3)
     ON CONFLICT (workspace_id, name) DO UPDATE SET color = $3 RETURNING *`,
    [workspaceId, name, color || '#6366f1']
  );
  return r.rows[0];
}

async function deleteLabel(labelId, workspaceId) {
  await query(`DELETE FROM ticket_labels WHERE id = $1 AND workspace_id = $2`, [labelId, workspaceId]);
}

// ── Reports ───────────────────────────────────────────────────────────────────

async function getResolutionReport(workspaceId, { from, to, boardId }) {
  const params = [workspaceId, from, to];
  let boardFilter = '';
  if (boardId) { params.push(boardId); boardFilter = `AND tb.id = $${params.length}`; }

  const r = await query(
    `SELECT
       u.id AS user_id,
       u.name AS user_name,
       u.avatar_url,
       COUNT(t.id)::int                                              AS total_tickets,
       COUNT(t.id) FILTER (WHERE t.resolved_at IS NOT NULL)::int     AS resolved_tickets,
       ROUND(AVG(
         EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600
       ) FILTER (WHERE t.resolved_at IS NOT NULL), 2)               AS avg_resolution_hours,
       COALESCE(SUM(ttl.duration_seconds) / 3600.0, 0)              AS total_hours_logged
     FROM users u
     JOIN tickets t ON t.assignee_id = u.id
     JOIN ticket_boards tb ON tb.id = t.board_id
     LEFT JOIN ticket_time_logs ttl ON ttl.ticket_id = t.id AND ttl.user_id = u.id
     WHERE tb.workspace_id = $1
       AND t.created_at BETWEEN $2 AND $3
       AND NOT tb.is_archived
       ${boardFilter}
     GROUP BY u.id, u.name, u.avatar_url
     ORDER BY resolved_tickets DESC`,
    params
  );
  return r.rows;
}

// ── Recurring ticket spawner ──────────────────────────────────────────────────

async function listRecurringTickets(workspaceId, userId, isAdmin) {
  const params = [workspaceId];
  let visibilityClause = '';
  if (!isAdmin) {
    params.push(userId);
    visibilityClause = `AND (t.assignee_id = $2 OR t.created_by = $2)`;
  }

  const r = await query(
    `SELECT t.id, t.title, t.priority, t.due_date,
            t.recurrence_type, t.recurrence_interval, t.recurrence_end,
            t.is_recurring, t.created_at,
            tb.id AS board_id, tb.name AS board_name, tb.color AS board_color,
            tc.name AS column_name,
            u.name  AS assignee_name,
            (SELECT COUNT(*) FROM tickets child WHERE child.parent_ticket_id = t.id)::int AS spawn_count,
            (SELECT MAX(child.created_at) FROM tickets child WHERE child.parent_ticket_id = t.id) AS last_spawn_at
     FROM tickets t
     JOIN ticket_boards tb ON tb.id = t.board_id
     JOIN ticket_columns tc ON tc.id = t.column_id
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE tb.workspace_id = $1
       AND t.is_recurring = true
       AND NOT tb.is_archived
       ${visibilityClause}
     ORDER BY t.recurrence_end NULLS LAST, t.title ASC`,
    params
  );
  return r.rows;
}

async function spawnDueRecurringTickets() {
  const r = await query(
    `SELECT t.* FROM tickets t
     WHERE t.is_recurring = true
       AND (t.recurrence_end IS NULL OR t.recurrence_end > NOW())
       AND NOT EXISTS (
         SELECT 1 FROM tickets child
         WHERE child.parent_ticket_id = t.id
           AND child.created_at > NOW() - INTERVAL '1 day'
       )`,
  );

  const now = new Date();
  const spawned = [];

  // Calcula diferença em dias completos (meia-noite UTC vs meia-noite UTC)
  // para evitar erro de ±1 dia quando o ticket foi criado depois da hora do cron.
  function diffDaysUTC(from) {
    const a = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate());
    const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((b - a) / 86400000);
  }

  for (const tmpl of r.rows) {
    let shouldSpawn = false;
    const type = tmpl.recurrence_type || 'weekly'; // fallback: tickets sem tipo = semanal

    if (type === 'daily') {
      shouldSpawn = true;
    } else if (type === 'weekly') {
      const dayOfWeek = new Date(tmpl.created_at).getUTCDay();
      shouldSpawn = now.getUTCDay() === dayOfWeek;
    } else if (type === 'biweekly') {
      const d = diffDaysUTC(tmpl.created_at);
      shouldSpawn = d > 0 && d % 14 === 0;
    } else if (type === 'monthly') {
      const dayOfMonth = new Date(tmpl.created_at).getUTCDate();
      shouldSpawn = now.getUTCDate() === dayOfMonth;
    } else if (type === 'yearly') {
      const d = new Date(tmpl.created_at);
      shouldSpawn = now.getUTCDate() === d.getUTCDate() && now.getUTCMonth() === d.getUTCMonth();
    } else if (type === 'custom' && tmpl.recurrence_interval) {
      const d = diffDaysUTC(tmpl.created_at);
      shouldSpawn = d > 0 && d % tmpl.recurrence_interval === 0;
    }

    if (shouldSpawn) {
      // Calcula próximo due_date preservando o horário original (ex: sempre às 9h)
      // Soma o intervalo fixo da recorrência, não o tempo decorrido desde a criação
      let dueDate = null;
      if (tmpl.due_date) {
        const original = new Date(tmpl.due_date);
        const d        = diffDaysUTC(tmpl.created_at);
        let   addMs    = 0;

        if (type === 'daily')    addMs = d * 86400000;
        else if (type === 'weekly')   addMs = Math.round(d / 7)  * 7  * 86400000;
        else if (type === 'biweekly') addMs = Math.round(d / 14) * 14 * 86400000;
        else if (type === 'monthly') {
          const next = new Date(original);
          next.setUTCMonth(next.getUTCMonth() + Math.round(d / 30));
          dueDate = next;
        } else if (type === 'yearly') {
          const next = new Date(original);
          next.setUTCFullYear(next.getUTCFullYear() + Math.round(d / 365));
          dueDate = next;
        } else if (type === 'custom' && tmpl.recurrence_interval) {
          addMs = Math.round(d / tmpl.recurrence_interval) * tmpl.recurrence_interval * 86400000;
        }

        if (!dueDate) dueDate = new Date(original.getTime() + addMs);
      }

      const newTicket = await query(
        `INSERT INTO tickets (board_id, column_id, title, description, assignee_id, created_by, priority, due_date, position, estimated_hours, parent_ticket_id)
         SELECT board_id, column_id, title, description, assignee_id, created_by, priority, $2, 0, estimated_hours, id
         FROM tickets WHERE id = $1
         RETURNING *`,
        [tmpl.id, dueDate?.toISOString() || null]
      );
      spawned.push(newTicket.rows[0]);
    }
  }
  return spawned;
}

// ── Create ticket from WhatsApp conversation ──────────────────────────────────

async function createTicketFromConversation(workspaceId, userId, { boardId, columnId, conversationId, contactId, contactName, title, description, assigneeId, priority }) {
  // Prevent duplicate
  const existing = await query(
    `SELECT t.id FROM tickets t
     JOIN ticket_boards tb ON tb.id = t.board_id
     WHERE t.conversation_id = $1 AND tb.workspace_id = $2 LIMIT 1`,
    [conversationId, workspaceId]
  );
  if (existing.rows.length) return existing.rows[0];

  // Get first column if not provided
  let targetColumnId = columnId;
  if (!targetColumnId) {
    const colR = await query(
      `SELECT id FROM ticket_columns WHERE board_id = $1 ORDER BY position LIMIT 1`,
      [boardId]
    );
    if (!colR.rows.length) throw new Error('Board sem colunas');
    targetColumnId = colR.rows[0].id;
  }

  return createTicket(boardId, userId, {
    columnId: targetColumnId,
    title: title || contactName || 'Novo Ticket',
    description: description || null,
    assigneeId,
    priority: priority || 'medium',
    conversationId,
    contactId,
    contactName,
  });
}

// ── Comments ──────────────────────────────────────────────────────────────────

async function listComments(ticketId) {
  const r = await query(
    `SELECT tc.*, u.name AS user_name, u.avatar_url AS user_avatar,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ta.id, 'file_name', ta.file_name, 'file_url', ta.file_url,
                  'file_size', ta.file_size, 'mime_type', ta.mime_type
                ) ORDER BY ta.created_at
              ) FILTER (WHERE ta.id IS NOT NULL), '[]'
            ) AS attachments
     FROM ticket_comments tc
     LEFT JOIN users u ON u.id = tc.user_id
     LEFT JOIN ticket_attachments ta ON ta.comment_id = tc.id
     WHERE tc.ticket_id = $1
     GROUP BY tc.id, u.name, u.avatar_url
     ORDER BY tc.created_at ASC`,
    [ticketId]
  );
  return r.rows;
}

async function createComment(ticketId, workspaceId, userId, content) {
  const r = await query(
    `INSERT INTO ticket_comments (ticket_id, workspace_id, user_id, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [ticketId, workspaceId, userId, content || null]
  );
  const comment = r.rows[0];
  const userRes = await query('SELECT name, avatar_url FROM users WHERE id = $1', [userId]);

  // Notifica participantes e mencionados em background
  notif.notifyComment(ticketId, userId, content);
  notif.notifyMentions(ticketId, workspaceId, userId, content);

  return { ...comment, user_name: userRes.rows[0]?.name, user_avatar: userRes.rows[0]?.avatar_url, attachments: [] };
}

async function deleteComment(commentId, userId, workspaceId) {
  await query(
    `DELETE FROM ticket_comments WHERE id = $1 AND workspace_id = $2 AND (user_id = $3 OR $3 IN (
      SELECT u.id FROM users u JOIN workspace_memberships wm ON wm.user_id = u.id
      WHERE wm.workspace_id = $2 AND wm.role IN ('admin','owner')
    ))`,
    [commentId, workspaceId, userId]
  );
}

// ── Attachments ───────────────────────────────────────────────────────────────

async function listAttachments(ticketId) {
  const r = await query(
    `SELECT ta.*, u.name AS user_name FROM ticket_attachments ta
     LEFT JOIN users u ON u.id = ta.user_id
     WHERE ta.ticket_id = $1 AND ta.comment_id IS NULL
     ORDER BY ta.created_at DESC`,
    [ticketId]
  );
  return r.rows;
}

async function addAttachment(ticketId, commentId, workspaceId, userId, { fileName, fileUrl, fileSize, mimeType }) {
  const r = await query(
    `INSERT INTO ticket_attachments (ticket_id, comment_id, workspace_id, user_id, file_name, file_url, file_size, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [ticketId, commentId || null, workspaceId, userId, fileName, fileUrl, fileSize || 0, mimeType || null]
  );
  return r.rows[0];
}

async function deleteAttachment(attachmentId, workspaceId) {
  await query('DELETE FROM ticket_attachments WHERE id = $1 AND workspace_id = $2', [attachmentId, workspaceId]);
}

// ── In-app alerts (atribuições e menções) ─────────────────────────────────────

async function createAlert(userId, ticketId, boardId, type, message) {
  const r = await query(
    `INSERT INTO ticket_alerts (user_id, ticket_id, board_id, type, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, ticketId, boardId, type, message || null]
  );
  return r.rows[0];
}

async function listMyAlerts(userId) {
  const r = await query(
    `SELECT ta.*, t.title AS ticket_title, tb.name AS board_name
     FROM ticket_alerts ta
     JOIN tickets t       ON t.id  = ta.ticket_id
     JOIN ticket_boards tb ON tb.id = ta.board_id
     WHERE ta.user_id = $1 AND ta.is_read = false
     ORDER BY ta.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return r.rows;
}

async function markAlertRead(alertId, userId) {
  await query(
    `UPDATE ticket_alerts SET is_read = true WHERE id = $1 AND user_id = $2`,
    [alertId, userId]
  );
}

async function markAllAlertsRead(userId) {
  await query(`UPDATE ticket_alerts SET is_read = true WHERE user_id = $1`, [userId]);
}

// ── Storage usage ─────────────────────────────────────────────────────────────

async function getStorageUsage(workspaceId) {
  const r = await query(
    `SELECT COALESCE(SUM(file_size), 0)::bigint AS used_bytes
     FROM ticket_attachments WHERE workspace_id = $1`,
    [workspaceId]
  );
  const wsRes = await query(
    'SELECT ticket_storage_quota_mb FROM workspaces WHERE id = $1', [workspaceId]
  );
  const quotaMb  = wsRes.rows[0]?.ticket_storage_quota_mb ?? 5120;
  const usedBytes = parseInt(r.rows[0].used_bytes, 10);
  return {
    used_bytes:  usedBytes,
    quota_bytes: quotaMb * 1024 * 1024,
    quota_mb:    quotaMb,
    used_mb:     Math.round(usedBytes / (1024 * 1024) * 100) / 100,
    pct:         Math.round((usedBytes / (quotaMb * 1024 * 1024)) * 100),
  };
}

module.exports = {
  isTicketsEnabled,
  setTicketsEnabled,
  listBoards,
  listAllBoards,
  createBoard,
  duplicateBoard,
  getBoard,
  updateBoard,
  archiveBoard,
  listBoardMembers,
  addBoardMember,
  updateBoardMemberRole,
  removeBoardMember,
  getBoardRole,
  getBoardMemberRole,
  createColumn,
  updateColumn,
  reorderColumns,
  deleteColumn,
  createTicket,
  getTicket,
  updateTicket,
  deleteTicket,
  getMyTasks,
  getCalendarTickets,
  getTimeLogs,
  startTimer,
  stopTimer,
  addManualTime,
  deleteTimeLog,
  getActiveTimer,
  listReminders,
  createReminder,
  deleteReminder,
  getDueReminders,
  markReminderSent,
  listLabels,
  createLabel,
  deleteLabel,
  getResolutionReport,
  listRecurringTickets,
  spawnDueRecurringTickets,
  createTicketFromConversation,
  listComments,
  createComment,
  deleteComment,
  listAttachments,
  addAttachment,
  deleteAttachment,
  getStorageUsage,
  createAlert,
  listMyAlerts,
  markAlertRead,
  markAllAlertsRead,
};
