'use strict';

const { query } = require('../../config/database');

async function list(workspaceId, { search } = {}) {
  const params = [workspaceId];
  let where = 'WHERE workspace_id = $1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (name ILIKE $${params.length} OR agency_name ILIKE $${params.length} OR creci ILIKE $${params.length})`;
  }

  const r = await query(`SELECT * FROM partner_brokers ${where} ORDER BY name ASC`, params);
  return r.rows;
}

async function getById(id, workspaceId) {
  const r = await query('SELECT * FROM partner_brokers WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Corretor parceiro não encontrado'), { status: 404 });
  return r.rows[0];
}

async function create(workspaceId, body) {
  const { name, agencyName, creci, phone, email, pixKey, notes } = body;
  if (!name) throw Object.assign(new Error('name é obrigatório'), { status: 400 });

  const r = await query(
    `INSERT INTO partner_brokers (workspace_id, name, agency_name, creci, phone, email, pix_key, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [workspaceId, name, agencyName || null, creci || null, phone || null, email || null, pixKey || null, notes || null]
  );
  return r.rows[0];
}

const UPDATE_FIELD_MAP = {
  name: 'name', agencyName: 'agency_name', creci: 'creci',
  phone: 'phone', email: 'email', pixKey: 'pix_key', notes: 'notes',
};

async function update(id, workspaceId, body) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[k] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      vals.push(body[k]);
    }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  fields.push('updated_at = NOW()');
  vals.push(id, workspaceId);

  const r = await query(
    `UPDATE partner_brokers SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Corretor parceiro não encontrado'), { status: 404 });
  return r.rows[0];
}

async function remove(id, workspaceId) {
  const r = await query('DELETE FROM partner_brokers WHERE id = $1 AND workspace_id = $2 RETURNING id', [id, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Corretor parceiro não encontrado'), { status: 404 });
}

module.exports = { list, getById, create, update, remove };
