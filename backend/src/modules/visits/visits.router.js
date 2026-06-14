'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./visits.service');

const router = Router({ mergeParams: true });

router.get('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { status, assigneeId, from, to } = req.query;
    res.json(await svc.list(req.params.workspaceId, { status, assigneeId, from, to }));
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { propertyId, scheduledAt } = req.body;
    if (!propertyId || !scheduledAt) return res.status(400).json({ error: 'propertyId e scheduledAt são obrigatórios' });
    const visit = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(visit);
  } catch (err) { next(err); }
});

router.put('/:visitId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const visit = await svc.update(req.params.visitId, req.params.workspaceId, req.body);
    res.json(visit);
  } catch (err) { next(err); }
});

module.exports = router;
