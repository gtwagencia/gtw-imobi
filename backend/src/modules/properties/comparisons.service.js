'use strict';

const { query } = require('../../config/database');
const propertiesSvc = require('./properties.service');

const MAX_ITEMS = 6;

// ── Create ────────────────────────────────────────────────────────────────

async function create(workspaceId, { propertyIds, title }, userId) {
  if (!Array.isArray(propertyIds) || propertyIds.length < 2) {
    throw Object.assign(new Error('Selecione ao menos 2 imóveis para comparar'), { status: 400 });
  }
  if (propertyIds.length > MAX_ITEMS) {
    throw Object.assign(new Error(`É possível comparar no máximo ${MAX_ITEMS} imóveis`), { status: 400 });
  }

  const found = await query(
    'SELECT id FROM properties WHERE workspace_id = $1 AND id = ANY($2)',
    [workspaceId, propertyIds]
  );
  if (found.rows.length !== propertyIds.length) {
    throw Object.assign(new Error('Um ou mais imóveis não foram encontrados'), { status: 404 });
  }

  const r = await query(
    `INSERT INTO property_comparisons (workspace_id, title, property_ids, created_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [workspaceId, title || null, propertyIds, userId || null]
  );
  return r.rows[0];
}

// ── Get by token (público) ───────────────────────────────────────────────

async function getByToken(token) {
  const r = await query('SELECT * FROM property_comparisons WHERE token = $1', [token]);
  if (!r.rows.length) throw Object.assign(new Error('Comparativo não encontrado'), { status: 404 });
  const comparison = r.rows[0];

  const wsRes = await query('SELECT name, logo_url FROM workspaces WHERE id = $1', [comparison.workspace_id]);

  const properties = [];
  for (const id of comparison.property_ids) {
    const p = await propertiesSvc.getById(id, comparison.workspace_id);
    if (p) properties.push(p);
  }

  return { ...comparison, workspace: wsRes.rows[0] || null, properties };
}

// ── Remove ────────────────────────────────────────────────────────────────

async function remove(id, workspaceId) {
  const r = await query(
    'DELETE FROM property_comparisons WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [id, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Comparativo não encontrado'), { status: 404 });
}

module.exports = { create, getByToken, remove, MAX_ITEMS };
