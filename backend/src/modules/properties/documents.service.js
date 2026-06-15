'use strict';

const { query } = require('../../config/database');

const CATEGORIES = [
  'matricula', 'escritura', 'iptu', 'habite_se', 'contrato',
  'certidao_negativa', 'laudo_avaliacao', 'planta', 'outro',
];

async function assertPropertyExists(propertyId, workspaceId) {
  const r = await query('SELECT id FROM properties WHERE id = $1 AND workspace_id = $2', [propertyId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });
}

async function list(propertyId, workspaceId) {
  await assertPropertyExists(propertyId, workspaceId);
  const r = await query(
    `SELECT * FROM property_documents WHERE property_id = $1 ORDER BY created_at DESC`,
    [propertyId]
  );
  return r.rows;
}

async function create(propertyId, workspaceId, { name, category, fileUrl, fileType, expiresAt }, userId) {
  await assertPropertyExists(propertyId, workspaceId);

  const cat = CATEGORIES.includes(category) ? category : 'outro';
  const r = await query(
    `INSERT INTO property_documents (property_id, workspace_id, name, category, file_url, file_type, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [propertyId, workspaceId, name, cat, fileUrl, fileType || null, expiresAt || null, userId || null]
  );
  return r.rows[0];
}

async function setClientVisible(documentId, propertyId, workspaceId, isClientVisible) {
  await assertPropertyExists(propertyId, workspaceId);
  const r = await query(
    'UPDATE property_documents SET is_client_visible = $1 WHERE id = $2 AND property_id = $3 RETURNING id',
    [!!isClientVisible, documentId, propertyId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Documento não encontrado'), { status: 404 });
}

async function remove(documentId, propertyId, workspaceId) {
  await assertPropertyExists(propertyId, workspaceId);
  const r = await query(
    `DELETE FROM property_documents WHERE id = $1 AND property_id = $2 RETURNING id`,
    [documentId, propertyId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Documento não encontrado'), { status: 404 });
}

// ── Usado pelo job de vencimento ────────────────────────────────────────────

async function findExpiringSoon() {
  const r = await query(
    `SELECT pd.*, p.title AS property_title, p.code AS property_code, p.broker_id
     FROM property_documents pd
     JOIN properties p ON p.id = pd.property_id
     WHERE pd.expires_at IS NOT NULL
       AND pd.expires_at <= (NOW() + INTERVAL '30 days')
       AND (pd.expiry_notified_at IS NULL OR pd.expiry_notified_at < NOW() - INTERVAL '7 days')`
  );
  return r.rows;
}

async function markNotified(documentId) {
  await query(`UPDATE property_documents SET expiry_notified_at = NOW() WHERE id = $1`, [documentId]);
}

module.exports = { CATEGORIES, list, create, remove, setClientVisible, findExpiringSoon, markNotified };
