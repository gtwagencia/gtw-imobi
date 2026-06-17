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

// ── Seed de departamentos padrão por tipo de negócio ─────────────────────

const DEPT_TEMPLATES = {
  imobiliaria: [
    {
      name: 'Vendas',
      color: '#22c55e',
      description: 'Imóveis à venda — compra, proposta e financiamento',
      ai_routing_description: 'Clientes interessados em comprar imóvel, visitar, fazer proposta, financiamento, FGTS, avaliação de imóvel',
    },
    {
      name: 'Locação',
      color: '#3b82f6',
      description: 'Imóveis para alugar — residencial e comercial',
      ai_routing_description: 'Clientes interessados em alugar imóvel, contrato de locação, garantias locatícias, fiador, seguro-fiança',
    },
    {
      name: 'Captação',
      color: '#a855f7',
      description: 'Captação de novos imóveis para o portfólio',
      ai_routing_description: 'Proprietário quer anunciar ou colocar imóvel para vender ou alugar, avaliação gratuita, proposta de captação',
    },
    {
      name: 'Pós-venda',
      color: '#f97316',
      description: 'Suporte após fechamento do negócio',
      ai_routing_description: 'Suporte após compra ou locação, entrega de chaves, documentação pós-contrato, reclamações, satisfação',
    },
    {
      name: 'Reparos e Manutenção',
      color: '#ef4444',
      description: 'Chamados técnicos para imóveis administrados',
      ai_routing_description: 'Problemas no imóvel alugado, manutenção, reparos, infiltração, elétrica, hidráulica, chamado técnico',
    },
    {
      name: 'Administrativo',
      color: '#6366f1',
      description: 'Documentação, contratos e gestão interna',
      ai_routing_description: 'Boletos, segunda via, rescisão de contrato, reajuste de aluguel, documentação, demandas administrativas',
    },
  ],
  construtora: [
    {
      name: 'Comercial',
      color: '#22c55e',
      description: 'Vendas de unidades — lançamentos e estoque',
      ai_routing_description: 'Interesse em comprar unidade, reserva, proposta, visita ao stand ou decorado, tabela de preços, plantas disponíveis',
    },
    {
      name: 'Financeiro',
      color: '#eab308',
      description: 'Questões financeiras, boletos e distrato',
      ai_routing_description: 'Boletos, parcelas, financiamento bancário, distrato, inadimplência, segunda via, reajuste, FGTS, simulação',
    },
    {
      name: 'Jurídico',
      color: '#6366f1',
      description: 'Contratos, escritura e questões legais',
      ai_routing_description: 'Assinatura de contrato, escritura, habite-se, cancelamento, questões legais, ITBI, registro de imóvel, procuração',
    },
    {
      name: 'Obras e Engenharia',
      color: '#f97316',
      description: 'Acompanhamento de obra e customizações',
      ai_routing_description: 'Andamento de obra, cronograma, visita de obra, customizações de planta, acabamento, chamados técnicos',
    },
    {
      name: 'Pós-venda',
      color: '#3b82f6',
      description: 'Atendimento ao comprador após entrega das chaves',
      ai_routing_description: 'Clientes que já receberam as chaves, assistência técnica, vícios de construção, manutenção, satisfação pós-entrega',
    },
    {
      name: 'Administrativo',
      color: '#64748b',
      description: 'Gestão documental e demandas internas',
      ai_routing_description: 'Documentação geral, certidões, declarações, demandas administrativas que não se encaixam em outro setor',
    },
  ],
};

async function seedDefaultDepartments(workspaceId, businessModel) {
  const existing = await query('SELECT id FROM departments WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
  if (existing.rows.length) return;

  const model = businessModel === 'construtora' ? 'construtora' : 'imobiliaria';
  for (const dept of DEPT_TEMPLATES[model]) {
    await query(
      `INSERT INTO departments (workspace_id, name, color, description, ai_routing_description)
       VALUES ($1,$2,$3,$4,$5)`,
      [workspaceId, dept.name, dept.color, dept.description, dept.ai_routing_description],
    );
  }
}

module.exports = {
  list, getById, create, update, remove,
  getOverview,
  listAgents, assignAgent, removeAgent,
  listUnassignedAgents,
  seedDefaultDepartments,
};
