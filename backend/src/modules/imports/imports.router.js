'use strict';

const { Router }  = require('express');
const multer      = require('multer');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const svc = require('./imports.service');

const router  = Router({ mergeParams: true });
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Listar histórico de importações
router.get('/jobs', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const jobs = await svc.listJobs(req.params.workspaceId, parseInt(req.query.limit) || 20);
    res.json(jobs);
  } catch (err) { next(err); }
});

// ── Feed configs (sincronização automática) ────────────────────────────────────

router.get('/feeds', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    res.json(await svc.listFeedConfigs(req.params.workspaceId));
  } catch (err) { next(err); }
});

router.post('/feeds', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { source, url, intervalHours } = req.body;
    if (!source || !url) return res.status(400).json({ error: 'source e url são obrigatórios' });
    res.status(201).json(await svc.createFeedConfig(req.params.workspaceId, { source, url, intervalHours }));
  } catch (err) { next(err); }
});

router.patch('/feeds/:feedId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const updated = await svc.updateFeedConfig(req.params.workspaceId, req.params.feedId, req.body);
    if (!updated) return res.status(404).json({ error: 'Feed não encontrado' });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/feeds/:feedId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.deleteFeedConfig(req.params.workspaceId, req.params.feedId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// Execução manual de um feed específico
router.post('/feeds/:feedId/run', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const configs = await svc.listFeedConfigs(req.params.workspaceId);
    const cfg = configs.find(c => c.id === req.params.feedId);
    if (!cfg) return res.status(404).json({ error: 'Feed não encontrado' });
    const result = await svc.importFromUrl(cfg.workspace_id, cfg.url, cfg.source);
    const { query: dbQuery } = require('../../config/database');
    await dbQuery(
      `UPDATE property_feed_configs SET last_run_at = NOW(), last_result = $1, last_error = NULL WHERE id = $2`,
      [JSON.stringify(result), cfg.id]
    );
    res.json(result);
  } catch (err) { next(err); }
});

// Download do template CSV
router.get('/template.csv', authenticate, workspaceContext, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template-importacao-imoveis.csv"');
  res.send('﻿' + svc.getCSVTemplate());
});

// Importar via URL (Imoview, Praedium, Kenlo, RNXML, CSV URL...)
router.post('/url', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { url, source = 'auto' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL é obrigatória' });
    const result = await svc.importFromUrl(req.params.workspaceId, url, source);
    res.json(result);
  } catch (err) { next(err); }
});

// Importar via CSV (upload de arquivo)
router.post('/csv', authenticate, workspaceContext, requirePermission('properties'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo CSV não enviado' });
      const text   = req.file.buffer.toString('utf-8').replace(/^﻿/, '');
      const result = await svc.importFromCSV(req.params.workspaceId, text);
      res.json(result);
    } catch (err) { next(err); }
  }
);

module.exports = router;
