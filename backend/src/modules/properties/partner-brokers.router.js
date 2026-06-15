'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./partner-brokers.service');

const router = Router({ mergeParams: true });

router.get('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const brokers = await svc.list(req.params.workspaceId, { search: req.query.search });
    res.json(brokers);
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const broker = await svc.getById(req.params.id, req.params.workspaceId);
    res.json(broker);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const broker = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(broker);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const broker = await svc.update(req.params.id, req.params.workspaceId, req.body);
    res.json(broker);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.remove(req.params.id, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
