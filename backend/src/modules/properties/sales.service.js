'use strict';

const { query } = require('../../config/database');

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function assertPropertyExists(propertyId, workspaceId) {
  const r = await query('SELECT id, purpose, development_id FROM properties WHERE id = $1 AND workspace_id = $2', [propertyId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Imóvel não encontrado'), { status: 404 });
  return r.rows[0];
}

// Resolve o percentual de comissão: override da venda > empreendimento > workspace
async function resolveCommissionPct(property, workspaceId, override) {
  if (override != null) return Number(override);

  if (property.development_id) {
    const devRes = await query('SELECT commission_pct FROM developments WHERE id = $1', [property.development_id]);
    if (devRes.rows[0]?.commission_pct != null) return Number(devRes.rows[0].commission_pct);
  }

  const wsRes = await query('SELECT default_commission_pct FROM workspaces WHERE id = $1', [workspaceId]);
  return wsRes.rows[0]?.default_commission_pct != null ? Number(wsRes.rows[0].default_commission_pct) : null;
}

async function getByProperty(propertyId, workspaceId) {
  await assertPropertyExists(propertyId, workspaceId);
  const r = await query(
    `SELECT ps.*, c.name AS buyer_name, pb.name AS partner_broker_name
     FROM property_sales ps
     LEFT JOIN contacts c ON c.id = ps.buyer_id
     LEFT JOIN partner_brokers pb ON pb.id = ps.partner_broker_id
     WHERE ps.property_id = $1`,
    [propertyId]
  );
  return r.rows[0] || null;
}

async function upsert(propertyId, workspaceId, body, userId) {
  const property = await assertPropertyExists(propertyId, workspaceId);

  const {
    buyerId, salePrice, downPayment, installmentsCount, installmentValue,
    financingValue, saleDate, notes,
    commissionPct, partnerBrokerId, partnerCommissionPct, commissionStatus,
  } = body;

  if (salePrice == null) throw Object.assign(new Error('salePrice é obrigatório'), { status: 400 });

  // ── Cálculo automático de comissão ───────────────────────────────────────
  const resolvedCommissionPct = await resolveCommissionPct(property, workspaceId, commissionPct);
  const commissionValue = resolvedCommissionPct != null ? round2(salePrice * resolvedCommissionPct / 100) : null;

  const resolvedPartnerPct = partnerBrokerId ? Number(partnerCommissionPct ?? 0) : null;
  const partnerCommissionValue = (commissionValue != null && resolvedPartnerPct != null)
    ? round2(commissionValue * resolvedPartnerPct / 100) : null;
  const brokerCommissionValue = commissionValue != null
    ? round2(commissionValue - (partnerCommissionValue || 0)) : null;

  const r = await query(
    `INSERT INTO property_sales
       (workspace_id, property_id, buyer_id, sale_price, down_payment, installments_count,
        installment_value, financing_value, sale_date, notes, created_by,
        commission_pct, commission_value, partner_broker_id, partner_commission_pct,
        broker_commission_value, partner_commission_value, commission_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, CURRENT_DATE),$10,$11,
             $12,$13,$14,$15,$16,$17,COALESCE($18,'pendente'))
     ON CONFLICT (property_id) DO UPDATE SET
       buyer_id                 = EXCLUDED.buyer_id,
       sale_price               = EXCLUDED.sale_price,
       down_payment             = EXCLUDED.down_payment,
       installments_count       = EXCLUDED.installments_count,
       installment_value        = EXCLUDED.installment_value,
       financing_value          = EXCLUDED.financing_value,
       sale_date                = EXCLUDED.sale_date,
       notes                    = EXCLUDED.notes,
       commission_pct           = EXCLUDED.commission_pct,
       commission_value         = EXCLUDED.commission_value,
       partner_broker_id        = EXCLUDED.partner_broker_id,
       partner_commission_pct   = EXCLUDED.partner_commission_pct,
       broker_commission_value  = EXCLUDED.broker_commission_value,
       partner_commission_value = EXCLUDED.partner_commission_value,
       commission_status        = COALESCE($18, property_sales.commission_status),
       updated_at               = NOW()
     RETURNING *`,
    [workspaceId, propertyId, buyerId || null, salePrice, downPayment ?? null,
     installmentsCount ?? null, installmentValue ?? null, financingValue ?? null,
     saleDate || null, notes || null, userId || null,
     resolvedCommissionPct, commissionValue, partnerBrokerId || null, resolvedPartnerPct,
     brokerCommissionValue, partnerCommissionValue, commissionStatus || null]
  );

  // Marca o imóvel como vendido/alugado conforme a finalidade
  const newStatus = property.purpose === 'locacao' ? 'alugado' : 'vendido';
  await query('UPDATE properties SET status = $1 WHERE id = $2', [newStatus, propertyId]);

  return r.rows[0];
}

async function remove(propertyId, workspaceId) {
  await assertPropertyExists(propertyId, workspaceId);
  await query('DELETE FROM property_sales WHERE property_id = $1', [propertyId]);
  await query(
    `UPDATE properties SET status = 'disponivel' WHERE id = $1 AND status IN ('vendido','alugado')`,
    [propertyId]
  );
}

module.exports = { getByProperty, upsert, remove };
