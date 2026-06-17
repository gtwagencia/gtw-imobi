'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./ai-agent.service');

const router = Router({ mergeParams: true });
const mw = [authenticate, workspaceContext];

// GET /groups
router.get('/groups', ...mw, async (req, res, next) => {
  try {
    res.json(await svc.listGroups(req.params.workspaceId));
  } catch (err) { next(err); }
});

// GET /groups/:groupId
router.get('/groups/:groupId', ...mw, async (req, res, next) => {
  try {
    res.json(await svc.getGroupWithMembers(req.params.groupId, req.params.workspaceId));
  } catch (err) { next(err); }
});

// POST /groups
router.post('/groups', ...mw, requirePermission('inboxes'), async (req, res, next) => {
  try {
    const { name, description, groupType, routingMode } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    res.status(201).json(await svc.createGroup(req.params.workspaceId, { name, description, groupType, routingMode }));
  } catch (err) { next(err); }
});

// PUT /groups/:groupId
router.put('/groups/:groupId', ...mw, requirePermission('inboxes'), async (req, res, next) => {
  try {
    const { name, description, groupType, routingMode, isActive } = req.body;
    res.json(await svc.updateGroup(req.params.groupId, req.params.workspaceId, { name, description, groupType, routingMode, isActive }));
  } catch (err) { next(err); }
});

// DELETE /groups/:groupId
router.delete('/groups/:groupId', ...mw, requirePermission('inboxes'), async (req, res, next) => {
  try {
    await svc.deleteGroup(req.params.groupId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /groups/:groupId/members
router.post('/groups/:groupId/members', ...mw, requirePermission('inboxes'), async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
    res.status(201).json(await svc.addMember(req.params.groupId, req.params.workspaceId, userId));
  } catch (err) { next(err); }
});

// DELETE /groups/:groupId/members/:userId
router.delete('/groups/:groupId/members/:userId', ...mw, requirePermission('inboxes'), async (req, res, next) => {
  try {
    await svc.removeMember(req.params.groupId, req.params.workspaceId, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
