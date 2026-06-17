'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true });
const crypto  = require('crypto');
const { query } = require('../../config/database');
const { authenticate }    = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspace');

// Todos os endpoints exigem auth + workspace
router.use(authenticate, workspaceContext, requirePermission('properties'));

const wsId = req => req.workspace.id;

// ── Agencies ────────────────────────────────────────────────────────────────

// GET /agencies
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
              COUNT(u.id) AS users_count
       FROM partner_agencies a
       LEFT JOIN partner_agency_users u ON u.agency_id = a.id
       WHERE a.workspace_id = $1
       GROUP BY a.id
       ORDER BY a.name`,
      [wsId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /agencies
router.post('/', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO partner_agencies (workspace_id, name, cnpj, creci, phone, email, city, state, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [wsId(req), b.name, b.cnpj||null, b.creci||null, b.phone||null, b.email||null,
       b.city||null, b.state||null, b.address||null, b.notes||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /agencies/:agencyId
router.put('/:agencyId', async (req, res, next) => {
  try {
    const b = req.body;
    const fields = ['name','cnpj','creci','phone','email','city','state','address','notes','active'];
    const updates = []; const params = [];
    for (const f of fields) {
      if (b[f] !== undefined) { updates.push(`${f} = $${params.length+1}`); params.push(b[f] ?? null); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada a atualizar' });
    params.push(req.params.agencyId, wsId(req));
    const { rows } = await query(
      `UPDATE partner_agencies SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length-1} AND workspace_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Parceira não encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /agencies/:agencyId
router.delete('/:agencyId', async (req, res, next) => {
  try {
    await query('DELETE FROM partner_agencies WHERE id = $1 AND workspace_id = $2',
      [req.params.agencyId, wsId(req)]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Users ────────────────────────────────────────────────────────────────────

// GET /agencies/:agencyId/users
router.get('/:agencyId/users', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM partner_agency_users
       WHERE agency_id = $1 AND workspace_id = $2
       ORDER BY name`,
      [req.params.agencyId, wsId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /agencies/:agencyId/users
router.post('/:agencyId/users', async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO partner_agency_users (agency_id, workspace_id, name, role, email, phone, creci, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.agencyId, wsId(req), b.name, b.role||'corretor',
       b.email||null, b.phone||null, b.creci||null, b.notes||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /agencies/:agencyId/users/:userId
router.put('/:agencyId/users/:userId', async (req, res, next) => {
  try {
    const b = req.body;
    const fields = ['name','role','email','phone','creci','notes','portal_active','portal_developments'];
    const updates = []; const params = [];
    for (const f of fields) {
      if (b[f] !== undefined) { updates.push(`${f} = $${params.length+1}`); params.push(b[f] ?? null); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada a atualizar' });
    params.push(req.params.userId, req.params.agencyId, wsId(req));
    const { rows } = await query(
      `UPDATE partner_agency_users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length-2} AND agency_id = $${params.length-1} AND workspace_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /agencies/:agencyId/users/:userId
router.delete('/:agencyId/users/:userId', async (req, res, next) => {
  try {
    await query('DELETE FROM partner_agency_users WHERE id = $1 AND agency_id = $2 AND workspace_id = $3',
      [req.params.userId, req.params.agencyId, wsId(req)]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /agencies/:agencyId/users/:userId/generate-token
router.post('/:agencyId/users/:userId/generate-token', async (req, res, next) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const devIds = req.body.developmentIds || [];
    const { rows } = await query(
      `UPDATE partner_agency_users
       SET portal_token = $1, portal_active = true, portal_developments = $2, updated_at = NOW()
       WHERE id = $3 AND agency_id = $4 AND workspace_id = $5 RETURNING *`,
      [token, devIds, req.params.userId, req.params.agencyId, wsId(req)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
