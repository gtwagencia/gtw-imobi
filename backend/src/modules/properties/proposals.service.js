'use strict';

const { query } = require('../../config/database');
const propertiesSvc = require('./properties.service');
const salesSvc = require('./sales.service');

const STATUSES = ['rascunho', 'enviada', 'assinada', 'cancelada'];

// Monta uma cópia dos dados do imóvel/venda/marca no momento da geração,
// para manter o conteúdo da proposta estável mesmo se o cadastro mudar depois.
async function buildContentSnapshot(property, workspaceId) {
  const wsRes = await query('SELECT name, logo_url FROM workspaces WHERE id = $1', [workspaceId]);
  const sale = await salesSvc.getByProperty(property.id, workspaceId);

  return {
    property: {
      code: property.code,
      title: property.title,
      property_type: property.property_type,
      purpose: property.purpose,
      street: property.street,
      number: property.number,
      complement: property.complement,
      neighborhood: property.neighborhood,
      city: property.city,
      state: property.state,
      total_area: property.total_area,
      built_area: property.built_area,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      suites: property.suites,
      parking_spots: property.parking_spots,
      sale_price: property.sale_price,
      rent_price: property.rent_price,
      cover_url: property.media?.find(m => m.is_cover)?.url || property.media?.[0]?.url || null,
    },
    sale: sale ? {
      sale_price: sale.sale_price,
      down_payment: sale.down_payment,
      installments_count: sale.installments_count,
      installment_value: sale.installment_value,
      financing_value: sale.financing_value,
    } : null,
    workspace: wsRes.rows[0] || null,
  };
}

async function list(propertyId, workspaceId) {
  const r = await query(
    `SELECT * FROM property_proposals WHERE property_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
    [propertyId, workspaceId]
  );
  return r.rows;
}

async function create(propertyId, workspaceId, body, userId) {
  const property = await propertiesSvc.getById(propertyId, workspaceId);
  if (!property) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });

  const {
    title, buyerName, buyerDocument, buyerEmail, buyerPhone,
    proposedPrice, paymentConditions, validityDate,
  } = body;

  if (!buyerName) throw Object.assign(new Error('buyerName é obrigatório'), { status: 400 });
  if (proposedPrice == null) throw Object.assign(new Error('proposedPrice é obrigatório'), { status: 400 });

  const content = await buildContentSnapshot(property, workspaceId);

  const r = await query(
    `INSERT INTO property_proposals
       (workspace_id, property_id, title, buyer_name, buyer_document, buyer_email, buyer_phone,
        proposed_price, payment_conditions, validity_date, content, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [workspaceId, propertyId, title || null, buyerName, buyerDocument || null, buyerEmail || null,
     buyerPhone || null, proposedPrice, paymentConditions || null, validityDate || null,
     JSON.stringify(content), userId || null]
  );
  return r.rows[0];
}

async function updateStatus(id, propertyId, workspaceId, status) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Status inválido'), { status: 400 });

  const r = await query(
    `UPDATE property_proposals SET status = $1, updated_at = NOW()
     WHERE id = $2 AND property_id = $3 AND workspace_id = $4 RETURNING *`,
    [status, id, propertyId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Proposta não encontrada'), { status: 404 });
  return r.rows[0];
}

async function remove(id, propertyId, workspaceId) {
  const r = await query(
    'DELETE FROM property_proposals WHERE id = $1 AND property_id = $2 AND workspace_id = $3 RETURNING id',
    [id, propertyId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Proposta não encontrada'), { status: 404 });
}

// ── Acesso público (token) ───────────────────────────────────────────────

async function getByToken(token) {
  const r = await query('SELECT * FROM property_proposals WHERE token = $1', [token]);
  if (!r.rows.length) throw Object.assign(new Error('Proposta não encontrada'), { status: 404 });
  return r.rows[0];
}

async function sign(token, { name, document }, ip) {
  if (!name || !document) {
    throw Object.assign(new Error('Nome e documento são obrigatórios'), { status: 400 });
  }

  const r = await query(
    `UPDATE property_proposals
        SET status = 'assinada', signature_name = $1, signature_document = $2,
            signed_at = NOW(), signed_ip = $3, updated_at = NOW()
      WHERE token = $4 AND status != 'assinada'
      RETURNING *`,
    [name, document, ip || null, token]
  );
  if (!r.rows.length) throw Object.assign(new Error('Proposta não encontrada ou já assinada'), { status: 404 });
  return r.rows[0];
}

module.exports = { STATUSES, list, create, updateStatus, remove, getByToken, sign };
