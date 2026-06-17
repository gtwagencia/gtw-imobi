'use strict';

const { query } = require('../../config/database');

// ── Grupos de atendimento ─────────────────────────────────────────────────────

async function listGroups(workspaceId) {
  const r = await query(
    `SELECT g.*,
            COUNT(gm.id) FILTER (WHERE gm.is_active) ::int AS member_count
     FROM ai_routing_groups g
     LEFT JOIN ai_routing_group_members gm ON gm.group_id = g.id
     WHERE g.workspace_id = $1
     GROUP BY g.id
     ORDER BY g.group_type, g.name`,
    [workspaceId]
  );
  return r.rows;
}

async function getGroupWithMembers(groupId, workspaceId) {
  const gRes = await query(
    'SELECT * FROM ai_routing_groups WHERE id = $1 AND workspace_id = $2',
    [groupId, workspaceId]
  );
  const group = gRes.rows[0];
  if (!group) throw Object.assign(new Error('Grupo não encontrado'), { status: 404 });

  const mRes = await query(
    `SELECT gm.id AS membership_id, gm.is_active, gm.created_at AS added_at,
            u.id, u.name, u.email, u.avatar_url
     FROM ai_routing_group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY u.name`,
    [groupId]
  );
  group.members = mRes.rows;
  return group;
}

async function createGroup(workspaceId, { name, description, groupType, routingMode }) {
  const r = await query(
    `INSERT INTO ai_routing_groups (workspace_id, name, description, group_type, routing_mode)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspaceId, name, description || null, groupType || 'geral', routingMode || 'round_robin']
  );
  return r.rows[0];
}

async function updateGroup(groupId, workspaceId, { name, description, groupType, routingMode, isActive }) {
  const fields = []; const vals = []; let idx = 1;
  if (name        !== undefined) { fields.push(`name = $${idx++}`);          vals.push(name); }
  if (description !== undefined) { fields.push(`description = $${idx++}`);   vals.push(description); }
  if (groupType   !== undefined) { fields.push(`group_type = $${idx++}`);    vals.push(groupType); }
  if (routingMode !== undefined) { fields.push(`routing_mode = $${idx++}`);  vals.push(routingMode); }
  if (isActive    !== undefined) { fields.push(`is_active = $${idx++}`);     vals.push(isActive); }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });
  vals.push(groupId); vals.push(workspaceId);
  const r = await query(
    `UPDATE ai_routing_groups SET ${fields.join(', ')} WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Grupo não encontrado'), { status: 404 });
  return r.rows[0];
}

async function deleteGroup(groupId, workspaceId) {
  await query('DELETE FROM ai_routing_groups WHERE id = $1 AND workspace_id = $2', [groupId, workspaceId]);
}

async function addMember(groupId, workspaceId, userId) {
  // Verifica que o grupo pertence ao workspace
  const gRes = await query(
    'SELECT id FROM ai_routing_groups WHERE id = $1 AND workspace_id = $2',
    [groupId, workspaceId]
  );
  if (!gRes.rows.length) throw Object.assign(new Error('Grupo não encontrado'), { status: 404 });

  const r = await query(
    `INSERT INTO ai_routing_group_members (group_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (group_id, user_id) DO UPDATE SET is_active = true
     RETURNING *`,
    [groupId, userId]
  );
  return r.rows[0];
}

async function removeMember(groupId, workspaceId, userId) {
  const gRes = await query(
    'SELECT id FROM ai_routing_groups WHERE id = $1 AND workspace_id = $2',
    [groupId, workspaceId]
  );
  if (!gRes.rows.length) throw Object.assign(new Error('Grupo não encontrado'), { status: 404 });
  await query(
    'UPDATE ai_routing_group_members SET is_active = false WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
}

/**
 * Seleciona o próximo membro do grupo em round-robin.
 * Retorna o user_id ou null se o grupo estiver vazio.
 */
async function pickNextMember(groupId) {
  const members = await query(
    `SELECT gm.user_id
     FROM ai_routing_group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.is_active = true AND u.is_active = true
     ORDER BY gm.created_at ASC`,
    [groupId]
  );
  if (!members.rows.length) return null;

  const groupRes = await query(
    'SELECT last_assigned_index FROM ai_routing_groups WHERE id = $1',
    [groupId]
  );
  const idx = (groupRes.rows[0]?.last_assigned_index || 0) % members.rows.length;
  const userId = members.rows[idx].user_id;

  await query(
    'UPDATE ai_routing_groups SET last_assigned_index = $1 WHERE id = $2',
    [idx + 1, groupId]
  );
  return userId;
}

// ── Seed padrão ao criar workspace ────────────────────────────────────────────

const DEFAULT_GROUPS = {
  imobiliaria: [
    {
      name: 'Compra e Venda',
      group_type: 'compra_venda',
      description: 'Atende leads interessados em comprar imóveis residenciais ou comerciais. Ativado quando o cliente quer comprar, adquirir, financiar, usar FGTS ou fazer permuta.',
    },
    {
      name: 'Locação',
      group_type: 'aluguel',
      description: 'Atende leads que querem alugar imóvel residencial ou comercial. Ativado quando o cliente menciona aluguel, locação, arrendamento ou contrato de aluguel.',
    },
    {
      name: 'Empreendimentos / Lançamentos',
      group_type: 'empreendimento',
      description: 'Atende leads interessados em empreendimentos na planta, lançamentos, pré-lançamentos ou imóveis em construção. Ativado quando o cliente menciona lançamento, planta, construtora ou empreendimento específico.',
    },
    {
      name: 'Investidores',
      group_type: 'investimento',
      description: 'Atende leads que querem investir em imóveis para renda (aluguel) ou valorização. Ativado quando o cliente menciona investimento, renda passiva, rentabilidade ou portfólio imobiliário.',
    },
    {
      name: 'Plantão Geral',
      group_type: 'plantao',
      description: 'Grupo de plantão que atende qualquer lead que não se encaixar nos grupos específicos, ou quando nenhum grupo especializado tem corretores disponíveis.',
    },
  ],
  construtora: [
    {
      name: 'Comercial Lançamentos',
      group_type: 'empreendimento',
      description: 'Atende leads interessados nos empreendimentos e unidades da construtora. Principal grupo de atendimento para todos os contatos de vendas.',
    },
    {
      name: 'Investidores',
      group_type: 'investimento',
      description: 'Atende investidores que querem adquirir múltiplas unidades ou têm interesse em rentabilidade do investimento.',
    },
    {
      name: 'Plantão de Obras',
      group_type: 'plantao',
      description: 'Atende dúvidas sobre andamento de obras, prazos de entrega e atualizações de obra para clientes que já compraram.',
    },
  ],
};

async function seedDefaultGroups(workspaceId, businessModel) {
  const model = businessModel === 'construtora' ? 'construtora' : 'imobiliaria';
  const groups = DEFAULT_GROUPS[model];
  for (const g of groups) {
    await query(
      `INSERT INTO ai_routing_groups (workspace_id, name, description, group_type)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [workspaceId, g.name, g.description, g.group_type]
    );
  }
}

module.exports = {
  listGroups, getGroupWithMembers, createGroup, updateGroup, deleteGroup,
  addMember, removeMember, pickNextMember, seedDefaultGroups,
};
