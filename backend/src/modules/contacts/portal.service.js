'use strict';

const crypto = require('crypto');
const { query } = require('../../config/database');
const constructionSvc = require('../developments/construction.service');

// ── Gestão de acesso (autenticado) ────────────────────────────────────────

async function grantAccess(contactId, workspaceId) {
  const r = await query('SELECT portal_token FROM contacts WHERE id = $1 AND workspace_id = $2', [contactId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
  if (r.rows[0].portal_token) return { token: r.rows[0].portal_token };

  const token = crypto.randomBytes(16).toString('hex');
  const upd = await query(
    'UPDATE contacts SET portal_token = $1 WHERE id = $2 AND workspace_id = $3 RETURNING portal_token',
    [token, contactId, workspaceId]
  );
  return { token: upd.rows[0].portal_token };
}

async function revokeAccess(contactId, workspaceId) {
  await query('UPDATE contacts SET portal_token = NULL WHERE id = $1 AND workspace_id = $2', [contactId, workspaceId]);
}

// ── Acesso público (token) ─────────────────────────────────────────────────

async function getPortalData(token) {
  const contactRes = await query(
    'SELECT id, workspace_id, name, email, phone FROM contacts WHERE portal_token = $1',
    [token]
  );
  if (!contactRes.rows.length) throw Object.assign(new Error('Portal não encontrado'), { status: 404 });
  const contact = contactRes.rows[0];

  const wsRes = await query('SELECT name, logo_url FROM workspaces WHERE id = $1', [contact.workspace_id]);

  const salesRes = await query(
    `SELECT ps.id, ps.sale_price, ps.down_payment, ps.installments_count, ps.installment_value,
            ps.financing_value, ps.sale_date,
            p.id AS property_id, p.code, p.title, p.property_type, p.purpose, p.status,
            p.street, p.number, p.complement, p.neighborhood, p.city, p.state, p.development_id,
            (SELECT url FROM property_media WHERE property_id = p.id AND is_cover = true LIMIT 1) AS cover_url
     FROM property_sales ps
     JOIN properties p ON p.id = ps.property_id
     WHERE ps.buyer_id = $1
     ORDER BY ps.sale_date DESC`,
    [contact.id]
  );

  const properties = [];
  for (const row of salesRes.rows) {
    const exchangesRes = await query(
      'SELECT * FROM property_exchanges WHERE sale_id = $1 ORDER BY created_at ASC',
      [row.id]
    );
    const docsRes = await query(
      `SELECT id, name, category, file_url, file_type, created_at FROM property_documents
       WHERE property_id = $1 AND is_client_visible = true ORDER BY created_at DESC`,
      [row.property_id]
    );

    const constructionStages = row.development_id
      ? await constructionSvc.listStages(row.development_id, contact.workspace_id)
      : [];

    properties.push({
      property: {
        id: row.property_id, code: row.code, title: row.title, property_type: row.property_type,
        purpose: row.purpose, status: row.status, street: row.street, number: row.number,
        complement: row.complement, neighborhood: row.neighborhood, city: row.city, state: row.state,
        cover_url: row.cover_url,
      },
      sale: {
        sale_price: row.sale_price, down_payment: row.down_payment, installments_count: row.installments_count,
        installment_value: row.installment_value, financing_value: row.financing_value, sale_date: row.sale_date,
      },
      exchanges: exchangesRes.rows,
      documents: docsRes.rows,
      construction_stages: constructionStages,
    });
  }

  return {
    contact: { name: contact.name, email: contact.email, phone: contact.phone },
    workspace: wsRes.rows[0] || null,
    properties,
  };
}

module.exports = { grantAccess, revokeAccess, getPortalData };
