'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./broadcasts.service');

const router = Router({ mergeParams: true });

// GET /broadcasts
router.get('/', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.list(req.params.workspaceId, {
      page:  parseInt(page,  10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
    });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /broadcasts/templates/:inboxId — ANTES de /:broadcastId para não colidir
router.get('/templates/:inboxId', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const templates = await svc.listTemplates(req.params.workspaceId, req.params.inboxId);
    res.json(templates);
  } catch (err) { next(err); }
});

// POST /broadcasts/templates/:inboxId/sync
router.post('/templates/:inboxId/sync', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const templates = await svc.syncTemplates(req.params.workspaceId, req.params.inboxId);
    res.json(templates);
  } catch (err) { next(err); }
});

// GET /broadcasts/:id
router.get('/:broadcastId', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const b = await svc.getById(req.params.broadcastId, req.params.workspaceId);
    if (!b) return res.status(404).json({ error: 'Broadcast não encontrado' });
    res.json(b);
  } catch (err) { next(err); }
});

// GET /broadcasts/:id/contacts
router.get('/:broadcastId/contacts', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.getContacts(req.params.broadcastId, {
      page:  parseInt(page,  10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /broadcasts
router.post('/', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const b = await svc.create(req.params.workspaceId, req.user.sub, req.body);
    res.status(201).json(b);
  } catch (err) { next(err); }
});

// POST /broadcasts/:id/contacts — adiciona contatos a um broadcast em rascunho
router.post('/:broadcastId/contacts', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const { contactIds } = req.body;
    if (!Array.isArray(contactIds) || !contactIds.length) {
      return res.status(400).json({ error: 'contactIds é obrigatório' });
    }
    await svc.addContacts(req.params.broadcastId, req.params.workspaceId, contactIds);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /broadcasts/:id/start
router.post('/:broadcastId/start', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const result = await svc.start(req.params.broadcastId, req.params.workspaceId);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /broadcasts/:id/pause
router.post('/:broadcastId/pause', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const b = await svc.pause(req.params.broadcastId, req.params.workspaceId);
    res.json(b);
  } catch (err) { next(err); }
});

// POST /broadcasts/:id/cancel
router.post('/:broadcastId/cancel', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    const b = await svc.cancel(req.params.broadcastId, req.params.workspaceId);
    res.json(b);
  } catch (err) { next(err); }
});

// DELETE /broadcasts/:id
router.delete('/:broadcastId', authenticate, workspaceContext, requirePermission('broadcasts'), async (req, res, next) => {
  try {
    await svc.remove(req.params.broadcastId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
