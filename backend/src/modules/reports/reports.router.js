'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./reports.service');

const router = Router({ mergeParams: true });

router.get('/summary', authenticate, workspaceContext, requirePermission('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getSummary(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/agents', authenticate, workspaceContext, requirePermission('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getAgentPerformance(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/volume', authenticate, workspaceContext, requirePermission('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getVolumeByDay(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/campaigns', authenticate, workspaceContext, requirePermission('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getCampaignBreakdown(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/deals-by-broker', authenticate, workspaceContext, requirePermission('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getBrokerDealPerformance(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/deals-by-source', authenticate, workspaceContext, requirePermission('reports'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getLeadSourcePerformance(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

module.exports = router;
