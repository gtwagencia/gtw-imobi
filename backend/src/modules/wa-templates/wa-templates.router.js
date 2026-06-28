'use strict';

const { Router }           = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./wa-templates.service');

const router = Router({ mergeParams: true });

// GET /workspaces/:workspaceId/wa-templates
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.listBatches(req.params.workspaceId, {
      page:  parseInt(page,  10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /workspaces/:workspaceId/wa-templates/:batchId
router.get('/:batchId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const batch = await svc.getBatch(req.params.batchId, req.params.workspaceId);
    res.json(batch);
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/wa-templates
router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const {
      baseName, category, language,
      headerType, headerText, footerText, buttons,
      baseBody, variantCount,
    } = req.body;

    if (!baseName) return res.status(400).json({ error: 'baseName é obrigatório' });
    if (!baseBody) return res.status(400).json({ error: 'baseBody é obrigatório' });

    const batch = await svc.createBatch(req.params.workspaceId, req.user.sub, {
      baseName, category, language,
      headerType, headerText, footerText, buttons,
      baseBody, variantCount,
    });
    res.status(201).json(batch);
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/wa-templates/:batchId/sync
router.post('/:batchId/sync', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const batch = await svc.syncBatchStatus(req.params.batchId, req.params.workspaceId);
    res.json(batch);
  } catch (err) { next(err); }
});

module.exports = router;
