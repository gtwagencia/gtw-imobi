'use strict';

// Portal público para usuários de parceiras (sem autenticação JWT)
// Montado em /api/v1/portal-parceiro

const express   = require('express');
const router    = express.Router();
const { query } = require('../../config/database');

// Busca o usuário parceiro pelo token
async function findUser(token) {
  const { rows } = await query(
    `SELECT u.*, a.name AS agency_name, a.id AS agency_id, a.workspace_id
     FROM partner_agency_users u
     JOIN partner_agencies a ON a.id = u.agency_id
     WHERE u.portal_token = $1 AND u.portal_active = true AND a.active = true`,
    [token]
  );
  return rows[0] || null;
}

// GET /api/v1/portal-parceiro/:token — dados do usuário + imobiliária
router.get('/:token', async (req, res, next) => {
  try {
    const user = await findUser(req.params.token);
    if (!user) return res.status(404).json({ error: 'Link inválido ou expirado' });
    res.json({
      id:          user.id,
      name:        user.name,
      role:        user.role,
      agencyName:  user.agency_name,
      agencyId:    user.agency_id,
      workspaceId: user.workspace_id,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/portal-parceiro/:token/empreendimentos
router.get('/:token/empreendimentos', async (req, res, next) => {
  try {
    const user = await findUser(req.params.token);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });

    let sql = `SELECT d.id, d.code, d.name, d.description, d.development_type, d.total_units,
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
    const params = [user.workspace_id];

    if (user.portal_developments?.length > 0) {
      sql += ` AND d.id = ANY($2::uuid[])`;
      params.push(user.portal_developments);
    }
    sql += ' GROUP BY d.id ORDER BY d.name';

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/v1/portal-parceiro/:token/empreendimentos/:devId/unidades
router.get('/:token/empreendimentos/:devId/unidades', async (req, res, next) => {
  try {
    const user = await findUser(req.params.token);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });
    const { devId } = req.params;
    if (user.portal_developments?.length > 0 && !user.portal_developments.includes(devId)) {
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
      [devId, user.workspace_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/portal-parceiro/:token/empreendimentos/:devId/propostas
router.post('/:token/empreendimentos/:devId/propostas', async (req, res, next) => {
  try {
    const user = await findUser(req.params.token);
    if (!user) return res.status(403).json({ error: 'Acesso negado' });
    const { devId } = req.params;
    if (user.portal_developments?.length > 0 && !user.portal_developments.includes(devId)) {
      return res.status(403).json({ error: 'Sem acesso a este empreendimento' });
    }
    const proposalsSvc = require('../developments/development-proposals.service');
    const proposal = await proposalsSvc.create(devId, user.workspace_id, {
      ...req.body,
      partnerAgency:       user.agency_name,
      partnerBroker:       user.name,
      partnerAgencyId:     user.agency_id,
      partnerAgencyUserId: user.id,
    }, null);
    res.status(201).json(proposal);
  } catch (err) { next(err); }
});

module.exports = router;
