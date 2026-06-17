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
