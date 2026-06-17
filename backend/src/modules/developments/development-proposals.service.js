'use strict';

const { query } = require('../../config/database');

// ── Helpers ───────────────────────────────────────────────────────────────

function err(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

// ── list ──────────────────────────────────────────────────────────────────
// Lista propostas de um empreendimento com filtro de status

async function list(developmentId, workspaceId, { status, page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const params = [developmentId, workspaceId];
  let where = 'WHERE dp.development_id = $1 AND dp.workspace_id = $2';

  if (status) {
    params.push(status);
    where += ` AND dp.status = $${params.length}`;
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM development_proposals dp ${where}`,
    params
  );

  params.push(limit, offset);
  const r = await query(
    `SELECT
       dp.*,
       p.code  AS property_code,
       p.title AS property_title,
       p.block_label, p.lot_label, p.unit_number,
       u.name  AS proposed_by_name
     FROM development_proposals dp
     LEFT JOIN properties p ON p.id = dp.property_id
     LEFT JOIN users u ON u.id = dp.proposed_by
     ${where}
     ORDER BY dp.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total: countRes.rows[0].total, page, limit };
}

// ── listByWorkspace ───────────────────────────────────────────────────────
// Todas as propostas do workspace (cross-empreendimentos)

async function listByWorkspace(workspaceId, { status, page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const params = [workspaceId];
  let where = 'WHERE dp.workspace_id = $1';

  if (status) {
    params.push(status);
    where += ` AND dp.status = $${params.length}`;
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM development_proposals dp ${where}`,
    params
  );

  params.push(limit, offset);
  const r = await query(
    `SELECT
       dp.*,
       d.name  AS development_name,
       d.code  AS development_code,
       p.code  AS property_code,
       p.title AS property_title,
       p.block_label, p.lot_label, p.unit_number,
       u.name  AS proposed_by_name
     FROM development_proposals dp
     LEFT JOIN developments d ON d.id = dp.development_id
     LEFT JOIN properties p ON p.id = dp.property_id
     LEFT JOIN users u ON u.id = dp.proposed_by
     ${where}
     ORDER BY dp.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total: countRes.rows[0].total, page, limit };
}

// ── getById ───────────────────────────────────────────────────────────────

async function getById(proposalId, workspaceId) {
  const r = await query(
    `SELECT
       dp.*,
       d.name  AS development_name,
       d.code  AS development_code,
       p.code  AS property_code,
       p.title AS property_title,
       p.block_label, p.lot_label, p.unit_number, p.total_area, p.sale_price,
       u.name  AS proposed_by_name,
       rv.name AS reviewed_by_name
     FROM development_proposals dp
     LEFT JOIN developments d ON d.id = dp.development_id
     LEFT JOIN properties p ON p.id = dp.property_id
     LEFT JOIN users u ON u.id = dp.proposed_by
     LEFT JOIN users rv ON rv.id = dp.reviewed_by
     WHERE dp.id = $1 AND dp.workspace_id = $2`,
    [proposalId, workspaceId]
  );
  if (!r.rows.length) throw err('Proposta não encontrada', 404);
  return r.rows[0];
}

// ── create ────────────────────────────────────────────────────────────────
// Cria proposta e reserva a unidade (status → reservado, reserved_until = expires_at)

async function create(developmentId, workspaceId, body, userId) {
  // Confirma empreendimento
  const devRes = await query(
    'SELECT id FROM developments WHERE id = $1 AND workspace_id = $2',
    [developmentId, workspaceId]
  );
  if (!devRes.rows.length) throw err('Empreendimento não encontrado', 404);

  // Confirma unidade e verifica disponibilidade
  const propRes = await query(
    `SELECT id, status FROM properties WHERE id = $1 AND development_id = $2 AND workspace_id = $3`,
    [body.propertyId, developmentId, workspaceId]
  );
  if (!propRes.rows.length) throw err('Unidade não encontrada', 404);
  if (propRes.rows[0].status === 'vendido') throw err('Unidade já vendida');
  if (propRes.rows[0].status === 'reservado') throw err('Unidade já reservada. Aguarde expiração ou rejeição da proposta existente.');

  const {
    partnerAgency, partnerBroker,
    buyerName, buyerCpf, buyerEmail, buyerPhone,
    proposedPrice, paymentType, downPayment, installments,
    installmentValue, financingBank, notes,
    expiresAt,
  } = body;

  if (!buyerName)     throw err('buyerName é obrigatório');
  if (!proposedPrice) throw err('proposedPrice é obrigatório');

  // Calcula expiração (padrão 72h)
  const expiresAtValue = expiresAt || null; // NULL → DEFAULT NOW() + INTERVAL '72 hours'

  const insertSql = expiresAtValue
    ? `INSERT INTO development_proposals (
         workspace_id, development_id, property_id,
         proposed_by, partner_agency, partner_broker,
         buyer_name, buyer_cpf, buyer_email, buyer_phone,
         proposed_price, payment_type, down_payment, installments,
         installment_value, financing_bank, notes,
         expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`
    : `INSERT INTO development_proposals (
         workspace_id, development_id, property_id,
         proposed_by, partner_agency, partner_broker,
         buyer_name, buyer_cpf, buyer_email, buyer_phone,
         proposed_price, payment_type, down_payment, installments,
         installment_value, financing_bank, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`;

  const insertParams = [
    workspaceId, developmentId, body.propertyId,
    userId || null, partnerAgency || null, partnerBroker || null,
    buyerName, buyerCpf || null, buyerEmail || null, buyerPhone || null,
    proposedPrice, paymentType || 'financiamento', downPayment || null, installments || null,
    installmentValue || null, financingBank || null, notes || null,
  ];
  if (expiresAtValue) insertParams.push(expiresAtValue);

  const r = await query(insertSql, insertParams);
  const proposal = r.rows[0];

  // Reserva a unidade
  await query(
    `UPDATE properties
     SET status = 'reservado', reserved_until = $1, reserved_by = $2
     WHERE id = $3`,
    [proposal.expires_at, userId || null, body.propertyId]
  );

  return proposal;
}

// ── approve ───────────────────────────────────────────────────────────────
// Aprova: muda proposta → approved, unidade → vendido, cria property_sales

async function approve(proposalId, workspaceId, reviewerId) {
  const proposal = await getById(proposalId, workspaceId);
  if (proposal.status !== 'pending') {
    throw err(`Proposta não pode ser aprovada (status atual: ${proposal.status})`);
  }

  // Atualiza proposta
  await query(
    `UPDATE development_proposals
     SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
     WHERE id = $2`,
    [reviewerId, proposalId]
  );

  // Marca unidade como vendido
  await query(
    `UPDATE properties
     SET status = 'vendido', reserved_until = NULL, reserved_by = NULL
     WHERE id = $1`,
    [proposal.property_id]
  );

  // Cria property_sales
  // Verifica se já existe (UNIQUE em property_id)
  const existing = await query(
    'SELECT id FROM property_sales WHERE property_id = $1',
    [proposal.property_id]
  );

  if (!existing.rows.length) {
    await query(
      `INSERT INTO property_sales (
         workspace_id, property_id,
         sale_price, down_payment, installments_count, installment_value,
         partner_broker_name, partner_agency_name,
         selling_broker_id,
         sale_date, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE,$10,$11)`,
      [
        workspaceId, proposal.property_id,
        proposal.proposed_price, proposal.down_payment || null,
        proposal.installments || null, proposal.installment_value || null,
        proposal.partner_broker || null, proposal.partner_agency || null,
        reviewerId || null,
        proposal.notes || null, reviewerId || null,
      ]
    );
  }

  return getById(proposalId, workspaceId);
}

// ── reject ────────────────────────────────────────────────────────────────
// Rejeita: proposta → rejected, unidade volta para 'disponivel'

async function reject(proposalId, workspaceId, reviewerId, reason) {
  const proposal = await getById(proposalId, workspaceId);
  if (proposal.status !== 'pending') {
    throw err(`Proposta não pode ser rejeitada (status atual: ${proposal.status})`);
  }

  await query(
    `UPDATE development_proposals
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
     WHERE id = $3`,
    [reviewerId, reason || null, proposalId]
  );

  // Devolve unidade para disponivel
  await query(
    `UPDATE properties
     SET status = 'disponivel', reserved_until = NULL, reserved_by = NULL
     WHERE id = $1 AND status = 'reservado'`,
    [proposal.property_id]
  );

  return getById(proposalId, workspaceId);
}

// ── expire ────────────────────────────────────────────────────────────────
// Chamada por job: expira propostas vencidas e devolve unidades para disponivel

async function expire() {
  // Busca propostas pending vencidas
  const expired = await query(
    `UPDATE development_proposals
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING property_id`,
  );

  if (!expired.rows.length) return { expired: 0 };

  const propertyIds = expired.rows.map(r => r.property_id);

  // Devolve unidades para disponivel
  await query(
    `UPDATE properties
     SET status = 'disponivel', reserved_until = NULL, reserved_by = NULL
     WHERE id = ANY($1) AND status = 'reservado'`,
    [propertyIds]
  );

  return { expired: expired.rows.length };
}

module.exports = { list, listByWorkspace, getById, create, approve, reject, expire };
