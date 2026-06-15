'use strict';

const { query } = require('../../config/database');

const STATUSES = ['pendente', 'aceita', 'recebida', 'revendida'];

async function assertSaleExists(propertyId, workspaceId) {
  const r = await query(
    `SELECT ps.id FROM property_sales ps
     JOIN properties p ON p.id = ps.property_id
     WHERE ps.property_id = $1 AND p.workspace_id = $2`,
    [propertyId, workspaceId]
  );
  if (!r.rows.length) {
    throw Object.assign(new Error('Registre as condições de venda antes de adicionar uma permuta'), { status: 404 });
  }
  return r.rows[0].id;
}

async function list(propertyId, workspaceId) {
  const saleId = await assertSaleExists(propertyId, workspaceId);
  const r = await query('SELECT * FROM property_exchanges WHERE sale_id = $1 ORDER BY created_at ASC', [saleId]);
  return r.rows;
}

async function create(propertyId, workspaceId, body) {
  const saleId = await assertSaleExists(propertyId, workspaceId);
  const { description, propertyType, address, appraisedValue, status, notes } = body;

  if (!description) throw Object.assign(new Error('description é obrigatório'), { status: 400 });
  if (appraisedValue == null) throw Object.assign(new Error('appraisedValue é obrigatório'), { status: 400 });

  const r = await query(
    `INSERT INTO property_exchanges (workspace_id, sale_id, description, property_type, address, appraised_value, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [workspaceId, saleId, description, propertyType || null, address || null, appraisedValue,
     STATUSES.includes(status) ? status : 'pendente', notes || null]
  );
  return r.rows[0];
}

const UPDATE_FIELD_MAP = {
  description: 'description', propertyType: 'property_type', address: 'address',
  appraisedValue: 'appraised_value', status: 'status', notes: 'notes',
};

async function update(exchangeId, propertyId, workspaceId, body) {
  const saleId = await assertSaleExists(propertyId, workspaceId);

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[k] === undefined) continue;
    if (k === 'status' && !STATUSES.includes(body[k])) continue;
    fields.push(`${col} = $${idx++}`);
    vals.push(body[k]);
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  fields.push('updated_at = NOW()');
  vals.push(exchangeId, saleId);

  const r = await query(
    `UPDATE property_exchanges SET ${fields.join(', ')} WHERE id = $${idx} AND sale_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Permuta não encontrada'), { status: 404 });
  return r.rows[0];
}

async function remove(exchangeId, propertyId, workspaceId) {
  const saleId = await assertSaleExists(propertyId, workspaceId);
  const r = await query('DELETE FROM property_exchanges WHERE id = $1 AND sale_id = $2 RETURNING id', [exchangeId, saleId]);
  if (!r.rows.length) throw Object.assign(new Error('Permuta não encontrada'), { status: 404 });
}

module.exports = { STATUSES, list, create, update, remove };
