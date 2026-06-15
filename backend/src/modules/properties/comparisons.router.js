'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./comparisons.service');

const router = Router({ mergeParams: true });

router.post('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { propertyIds, title } = req.body;
    const comparison = await svc.create(req.params.workspaceId, { propertyIds, title }, req.user.sub);
    res.status(201).json(comparison);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.remove(req.params.id, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
