'use strict';

const express = require('express');
const router  = express.Router();
const { query } = require('../../config/database');
const crypto    = require('crypto');

// GET /api/v1/partner-portal/broker/:token — dados do broker + empreendimentos autorizados
router.get('/broker/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { rows } = await query(
      `SELECT pb.id, pb.name, pb.agency_name, pb.creci, pb.email, pb.phone,
              pb.workspace_id, pb.portal_active, pb.portal_developments
       FROM partner_brokers pb
       WHERE pb.portal_token = $1`,
      [token]
    );
    if (!rows.length || !rows[0].portal_active) return res.status(404).json({ error: 'Portal não encontrado ou inativo' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/v1/partner-portal/broker/:token/developments — lista empreendimentos autorizados
router.get('/broker/:token/developments', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { rows: brokerRows } = await query(
      'SELECT id, workspace_id, portal_active, portal_developments FROM partner_brokers WHERE portal_token = $1',
      [token]
    );
    if (!brokerRows.length || !brokerRows[0].portal_active) return res.status(403).json({ error: 'Acesso negado' });
    const broker = brokerRows[0];

    let devQuery = `SELECT d.id, d.code, d.name, d.description, d.development_type, d.total_units,
                           d.construction_status, d.city, d.state, d.commission_pct,
                           d.map_image_url, d.map_config,
                           COUNT(p.id) FILTER (WHERE p.status = 'disponivel') AS units_disponivel,
                           COUNT(p.id) FILTER (WHERE p.status = 'reservado')  AS units_reservado,
                           COUNT(p.id) FILTER (WHERE p.status = 'vendido')    AS units_vendido,
                           COUNT(p.id) AS units_total,
                           (SELECT url FROM development_media WHERE development_id = d.id AND is_cover = true LIMIT 1) AS cover_url
                    FROM developments d
                    LEFT JOIN properties p ON p.development_id = d.id
                    WHERE d.workspace_id = $1`;
    const params = [broker.workspace_id];

    if (broker.portal_developments && broker.portal_developments.length > 0) {
      devQuery += ` AND d.id = ANY($2::uuid[])`;
      params.push(broker.portal_developments);
    }
    devQuery += ' GROUP BY d.id ORDER BY d.name';

    const { rows } = await query(devQuery, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/v1/partner-portal/broker/:token/developments/:devId/units — unidades disponíveis
router.get('/broker/:token/developments/:devId/units', async (req, res, next) => {
  try {
    const { token, devId } = req.params;
    const { rows: brokerRows } = await query(
      'SELECT id, workspace_id, portal_active, portal_developments FROM partner_brokers WHERE portal_token = $1',
      [token]
    );
    if (!brokerRows.length || !brokerRows[0].portal_active) return res.status(403).json({ error: 'Acesso negado' });
    const broker = brokerRows[0];

    // Verifica se tem acesso ao empreendimento
    if (broker.portal_developments?.length > 0 && !broker.portal_developments.includes(devId)) {
      return res.status(403).json({ error: 'Sem acesso a este empreendimento' });
    }

    const { rows } = await query(
      `SELECT p.id, p.code, p.title, p.status, p.sale_price, p.total_area,
              p.block_label, p.lot_label, p.unit_number, p.unit_floor,
              p.price_zone, p.area_front, p.area_depth, p.area_left, p.area_right,
              p.map_shape, p.reserved_until, p.notes
       FROM properties p
       WHERE p.development_id = $1 AND p.workspace_id = $2
       ORDER BY p.block_label, p.lot_label, p.unit_number`,
      [devId, broker.workspace_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/partner-portal/broker/:token/developments/:devId/proposals — criar proposta
router.post('/broker/:token/developments/:devId/proposals', async (req, res, next) => {
  try {
    const { token, devId } = req.params;
    const { rows: brokerRows } = await query(
      'SELECT id, workspace_id, name, agency_name, portal_active, portal_developments FROM partner_brokers WHERE portal_token = $1',
      [token]
    );
    if (!brokerRows.length || !brokerRows[0].portal_active) return res.status(403).json({ error: 'Acesso negado' });
    const broker = brokerRows[0];

    if (broker.portal_developments?.length > 0 && !broker.portal_developments.includes(devId)) {
      return res.status(403).json({ error: 'Sem acesso a este empreendimento' });
    }

    const proposalsSvc = require('../developments/development-proposals.service');
    const proposal = await proposalsSvc.create(devId, broker.workspace_id, {
      ...req.body,
      partnerAgency:  broker.agency_name || req.body.partnerAgency,
      partnerBroker:  broker.name,
    }, null);
    res.status(201).json(proposal);
  } catch (err) { next(err); }
});

// ── Rotas admin (montadas em /api/v1/workspaces/:wsId/partner-portal) ────────
const { authenticate } = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspace');

// POST /api/v1/workspaces/:wsId/partner-portal/brokers/:brokerId/generate-token
router.post('/brokers/:brokerId/generate-token',
  authenticate, workspaceContext, requirePermission('properties'),
  async (req, res, next) => {
    try {
      const workspaceId = req.workspace?.id || req.params.workspaceId;
      const { brokerId } = req.params;
      const token = crypto.randomBytes(32).toString('hex');
      const { rows } = await query(
        `UPDATE partner_brokers SET portal_token = $1, portal_active = true, portal_developments = $3
         WHERE id = $2 AND workspace_id = $4 RETURNING id, name, portal_token, portal_active`,
        [token, brokerId, req.body.developmentIds || [], workspaceId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Corretor não encontrado' });
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

// PUT /api/v1/workspaces/:wsId/partner-portal/brokers/:brokerId/status
router.put('/brokers/:brokerId/status',
  authenticate, workspaceContext, requirePermission('properties'),
  async (req, res, next) => {
    try {
      const workspaceId = req.workspace?.id || req.params.workspaceId;
      const { brokerId } = req.params;
      const { active, developmentIds } = req.body;
      const updates = [];
      const params  = [];
      if (active !== undefined) { updates.push(`portal_active = $${params.length+1}`); params.push(active); }
      if (developmentIds)       { updates.push(`portal_developments = $${params.length+1}`); params.push(developmentIds); }
      if (!updates.length) return res.status(400).json({ error: 'Nada a atualizar' });
      params.push(brokerId, workspaceId);
      const { rows } = await query(
        `UPDATE partner_brokers SET ${updates.join(', ')} WHERE id = $${params.length-1} AND workspace_id = $${params.length} RETURNING id, name, portal_token, portal_active, portal_developments`,
        params
      );
      if (!rows.length) return res.status(404).json({ error: 'Corretor não encontrado' });
      res.json(rows[0]);
    } catch (err) { next(err); }
  }
);

module.exports = router;
