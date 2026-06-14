'use strict';

const { query } = require('../../config/database');

// ── CRUD ───────────────────────────────────────────────────────────────────

async function list(workspaceId) {
  const r = await query(
    `SELECT d.*,
            COUNT(DISTINCT wm.user_id)::int  AS agent_count,
            COUNT(DISTINCT c.id)::int        AS conversation_count
     FROM departments d
     LEFT JOIN workspace_memberships wm ON wm.department_id = d.id
     LEFT JOIN conversations c ON c.department_id = d.id AND c.status = 'open'
     WHERE d.workspace_id = $1
     GROUP BY d.id
     ORDER BY d.name`,
    [workspaceId]
  );
  return r.rows;
}

async function getById(deptId, workspaceId) {
  const r = await query(
    'SELECT * FROM departments WHERE id = $1 AND workspace_id = $2',
    [deptId, workspaceId]
  );
  return r.rows[0] || null;
}

async function create(workspaceId, { name, color, description }) {
  const r = await query(
    `INSERT INTO departments (workspace_id, name, color, description)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [workspaceId, name, color || '#6366f1', description || null]
  );
  return r.rows[0];
}

async function update(deptId, workspaceId, body) {
  const map = { name: 'name', color: 'color', description: 'description', aiPersona: 'ai_persona', aiRoutingDescription: 'ai_routing_description' };
  const fields = []; const vals = []; let idx = 1;

  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });

  vals.push(deptId, workspaceId);
  const r = await query(
    `UPDATE departments SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Departamento não encontrado'), { status: 404 });
  return r.rows[0];
}

async function remove(deptId, workspaceId) {
  // Remove o dept_id dos agentes antes de deletar
  await query('UPDATE workspace_memberships SET department_id = NULL WHERE department_id = $1', [deptId]);
  await query('DELETE FROM departments WHERE id = $1 AND workspace_id = $2', [deptId, workspaceId]);
}

// ── Painel de KPIs por setor ───────────────────────────────────────────────

async function getOverview(workspaceId) {
  const r = await query(
    `SELECT d.id, d.name, d.color,
            (SELECT COUNT(*)::int FROM workspace_memberships wm
              WHERE wm.department_id = d.id) AS agent_count,
            (SELECT COUNT(*)::int FROM conversations c
              WHERE c.department_id = d.id AND c.status = 'open') AS open_conversations,
            (SELECT ROUND(AVG(c.response_time_seconds))::int FROM conversations c
              WHERE c.department_id = d.id AND c.response_time_seconds IS NOT NULL) AS avg_response_seconds,
            (SELECT COUNT(*)::int FROM deals dl
              JOIN pipeline_departments pdep ON pdep.pipeline_id = dl.pipeline_id
              WHERE pdep.department_id = d.id AND dl.closed_at IS NULL) AS active_deals,
            (SELECT COALESCE(SUM(dl.value), 0) FROM deals dl
              JOIN pipeline_departments pdep ON pdep.pipeline_id = dl.pipeline_id
              WHERE pdep.department_id = d.id AND dl.closed_at IS NULL) AS pipeline_value,
            (SELECT COALESCE(json_agg(json_build_object(
                       'stage_name', ks.name, 'stage_color', ks.color, 'count', cnt
                     ) ORDER BY ks_position), '[]')
             FROM (
               SELECT ks.id, ks.name, ks.color, ks.position AS ks_position,
                      COUNT(dl.id)::int AS cnt
               FROM kanban_stages ks
               JOIN pipeline_departments pdep ON pdep.pipeline_id = ks.pipeline_id
               LEFT JOIN deals dl ON dl.stage_id = ks.id AND dl.closed_at IS NULL
               WHERE pdep.department_id = d.id
               GROUP BY ks.id, ks.name, ks.color, ks.position
             ) ks
            ) AS deals_by_stage,
            (SELECT pdep.pipeline_id FROM pipeline_departments pdep
              WHERE pdep.department_id = d.id LIMIT 1) AS primary_pipeline_id
     FROM departments d
     WHERE d.workspace_id = $1
     ORDER BY d.name`,
    [workspaceId]
  );
  return r.rows;
}

// ── Agents in department ───────────────────────────────────────────────────

async function listAgents(deptId, workspaceId) {
  const r = await query(
    `SELECT u.id, u.name, u.email, u.avatar_url, wm.role,
            COUNT(c.id)::int AS open_conversations
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN conversations c ON c.assignee_id = u.id
                               AND c.workspace_id = wm.workspace_id
                               AND c.status = 'open'
     WHERE wm.department_id = $1 AND wm.workspace_id = $2
     GROUP BY u.id, u.name, u.email, u.avatar_url, wm.role
     ORDER BY u.name`,
    [deptId, workspaceId]
  );
  return r.rows;
}

async function assignAgent(deptId, workspaceId, userId) {
  // Verify membership exists
  const r = await query(
    `SELECT id FROM workspace_memberships
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Usuário não é membro do workspace'), { status: 404 });

  await query(
    `UPDATE workspace_memberships SET department_id = $1
     WHERE workspace_id = $2 AND user_id = $3`,
    [deptId, workspaceId, userId]
  );
}

async function removeAgent(workspaceId, userId) {
  await query(
    `UPDATE workspace_memberships SET department_id = NULL
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
}

// ── Agents without department (available to assign) ───────────────────────

async function listUnassignedAgents(workspaceId) {
  const r = await query(
    `SELECT u.id, u.name, u.email, u.avatar_url, wm.role
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
       AND wm.department_id IS NULL
       AND wm.role = 'agent'
     ORDER BY u.name`,
    [workspaceId]
  );
  return r.rows;
}

module.exports = {
  list, getById, create, update, remove,
  getOverview,
  listAgents, assignAgent, removeAgent,
  listUnassignedAgents,
};
