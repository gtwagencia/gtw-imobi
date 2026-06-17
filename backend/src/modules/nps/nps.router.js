'use strict';

const { Router } = require('express');
const { authenticate }      = require('../../middleware/auth');
const { workspaceContext }  = require('../../middleware/workspaceContext');
const svc = require('./nps.service');

const router = Router({ mergeParams: true });

router.get('/metrics', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getMetrics(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/recent', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.listRecent(req.params.workspaceId, parseInt(req.query.limit) || 20));
  } catch (err) { next(err); }
});

router.post('/send/:visitId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const result = await svc.sendNpsAfterVisit(req.params.workspaceId, req.params.visitId);
    if (!result) return res.status(400).json({ error: 'NPS não configurado ou já enviado' });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/respond/:npsId', async (req, res, next) => {
  try {
    const { score, comment } = req.body;
    if (score == null || score < 0 || score > 10) return res.status(400).json({ error: 'Score deve ser 0–10' });
    const result = await svc.recordResponse(req.params.npsId, score, comment);
    if (!result) return res.status(404).json({ error: 'NPS não encontrado' });
    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

module.exports = router;
