'use strict';

const { Router } = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission, requireModule } = require('../../middleware/workspaceContext');
const storageSvc = require('../../services/storage.service');
const svc = require('./developments.service');
const importsSvc = require('./development-imports.service');
const constructionSvc = require('./construction.service');

const router = Router({ mergeParams: true });
const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const mapUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(Object.assign(new Error('Apenas arquivos PDF são aceitos'), { status: 415 }));
  },
});

const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};

router.get('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { search, constructionStatus, city, page, limit } = req.query;
    const result = await svc.list(req.params.workspaceId, {
      search: search?.slice(0, 200),
      constructionStatus,
      city: city?.slice(0, 100),
      page:  parseInt(page,  10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const development = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(development);
  } catch (err) { next(err); }
});

router.get('/:developmentId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const d = await svc.getById(req.params.developmentId, req.params.workspaceId);
    if (!d) return res.status(404).json({ error: 'Empreendimento não encontrado' });
    res.json(d);
  } catch (err) { next(err); }
});

router.put('/:developmentId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const d = await svc.update(req.params.developmentId, req.params.workspaceId, req.body);
    res.json(d);
  } catch (err) { next(err); }
});

router.delete('/:developmentId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.remove(req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Mapa de quadras/lotes: imagem da planta-base ──────────────────────────

router.post('/:developmentId/map-image', authenticate, workspaceContext, requirePermission('properties'), mapUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const mimeType = req.file.mimetype;
    if (!mimeType.startsWith('image/')) {
      return res.status(415).json({ error: 'Tipo de arquivo não permitido. Envie uma imagem ou converta o PDF no navegador.' });
    }

    const ext      = MIME_EXT[mimeType] || path.extname(req.file.originalname).toLowerCase() || '.bin';
    const filename = `${uuidv4()}${ext}`;
    const url      = await storageSvc.uploadFile(req.file.buffer, filename, mimeType);

    const development = await svc.update(req.params.developmentId, req.params.workspaceId, { mapImageUrl: url });
    res.json(development);
  } catch (err) { next(err); }
});

// ── Galeria de mídia ─────────────────────────────────────────────────────

router.post('/:developmentId/media', authenticate, workspaceContext, requirePermission('properties'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const mimeType = req.file.mimetype;
    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
      return res.status(415).json({ error: 'Tipo de arquivo não permitido' });
    }

    const ext      = MIME_EXT[mimeType] || path.extname(req.file.originalname).toLowerCase() || '.bin';
    const filename = `${uuidv4()}${ext}`;
    const url      = await storageSvc.uploadFile(req.file.buffer, filename, mimeType);
    const mediaType = mimeType.startsWith('video/') ? 'video' : 'image';

    const media = await svc.addMedia(req.params.developmentId, req.params.workspaceId, { url, mediaType });
    res.status(201).json(media);
  } catch (err) { next(err); }
});

router.delete('/:developmentId/media/:mediaId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.removeMedia(req.params.mediaId, req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:developmentId/media/reorder', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { mediaIds } = req.body;
    if (!Array.isArray(mediaIds)) return res.status(400).json({ error: 'mediaIds deve ser um array' });
    await svc.reorderMedia(req.params.developmentId, req.params.workspaceId, mediaIds);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:developmentId/media/:mediaId/cover', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.setCover(req.params.mediaId, req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:developmentId/media/:mediaId/show-on-site', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { showOnSite } = req.body;
    await svc.setShowOnSite(req.params.mediaId, req.params.developmentId, req.params.workspaceId, !!showOnSite);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Importação de loteamento via PDF (IA extrai os lotes) ────────────────

router.get('/:developmentId/imports', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const jobs = await importsSvc.listJobs(req.params.developmentId, req.params.workspaceId);
    res.json(jobs);
  } catch (err) { next(err); }
});

router.post('/:developmentId/imports', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), pdfUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const job = await importsSvc.createJob(
      req.params.workspaceId, req.params.developmentId,
      { buffer: req.file.buffer, filename: req.file.originalname },
      req.user.sub, req.workspace
    );
    res.status(201).json(job);
  } catch (err) { next(err); }
});

router.get('/:developmentId/imports/:jobId', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const job = await importsSvc.getJob(req.params.jobId, req.params.developmentId, req.params.workspaceId);
    res.json(job);
  } catch (err) { next(err); }
});

router.put('/:developmentId/imports/:jobId', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const { lots } = req.body;
    const job = await importsSvc.updateExtractedLots(req.params.jobId, req.params.developmentId, req.params.workspaceId, lots);
    res.json(job);
  } catch (err) { next(err); }
});

router.delete('/:developmentId/imports/:jobId', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    await importsSvc.removeJob(req.params.jobId, req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:developmentId/imports/:jobId/confirm', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const result = await importsSvc.confirmJob(req.params.jobId, req.params.developmentId, req.params.workspaceId);
    res.json(result);
  } catch (err) { next(err); }
});

// ── Cronograma de obra ────────────────────────────────────────────────────

router.get('/:developmentId/construction-stages', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const stages = await constructionSvc.listStages(req.params.developmentId, req.params.workspaceId);
    res.json(stages);
  } catch (err) { next(err); }
});

router.post('/:developmentId/construction-stages', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const stage = await constructionSvc.createStage(req.params.developmentId, req.params.workspaceId, req.body);
    res.status(201).json(stage);
  } catch (err) { next(err); }
});

router.put('/:developmentId/construction-stages/reorder', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const { stageIds } = req.body;
    if (!Array.isArray(stageIds)) return res.status(400).json({ error: 'stageIds deve ser um array' });
    await constructionSvc.reorderStages(req.params.developmentId, req.params.workspaceId, stageIds);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:developmentId/construction-stages/:stageId', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    const stage = await constructionSvc.updateStage(req.params.stageId, req.params.developmentId, req.params.workspaceId, req.body);
    res.json(stage);
  } catch (err) { next(err); }
});

router.delete('/:developmentId/construction-stages/:stageId', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    await constructionSvc.removeStage(req.params.stageId, req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:developmentId/construction-stages/:stageId/photos', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const mimeType = req.file.mimetype;
    if (!mimeType.startsWith('image/')) {
      return res.status(415).json({ error: 'Tipo de arquivo não permitido' });
    }

    const ext      = MIME_EXT[mimeType] || path.extname(req.file.originalname).toLowerCase() || '.bin';
    const filename = `${uuidv4()}${ext}`;
    const url      = await storageSvc.uploadFile(req.file.buffer, filename, mimeType);

    const photo = await constructionSvc.addPhoto(req.params.stageId, req.params.developmentId, req.params.workspaceId, {
      url, caption: req.body.caption,
    });
    res.status(201).json(photo);
  } catch (err) { next(err); }
});

router.delete('/:developmentId/construction-stages/:stageId/photos/:photoId', authenticate, workspaceContext, requireModule('developments'), requirePermission('properties'), async (req, res, next) => {
  try {
    await constructionSvc.removePhoto(req.params.photoId, req.params.stageId, req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Incorporadora: Unidades, Zonas de Preço e Propostas ──────────────────

const unitsSvc     = require('./development-units.service');
const proposalsSvc = require('./development-proposals.service');
const csvUpload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Units ────────────────────────────────────────────────────────────────

router.get('/:developmentId/units', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { status, zone, block, floor, page, limit } = req.query;
    const result = await unitsSvc.listUnits(req.params.developmentId, req.params.workspaceId, {
      status, zone, block, floor,
      page:  parseInt(page,  10) || 1,
      limit: Math.min(parseInt(limit, 10) || 200, 500),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:developmentId/units/:unitId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const unit = await unitsSvc.getUnit(req.params.unitId, req.params.workspaceId);
    res.json(unit);
  } catch (err) { next(err); }
});

router.put('/:developmentId/units/:unitId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const unit = await unitsSvc.updateUnit(req.params.unitId, req.params.workspaceId, req.body);
    res.json(unit);
  } catch (err) { next(err); }
});

router.post('/:developmentId/units/price-adjust', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { mode, value, zoneFilter, blockFilter } = req.body;
    const result = await unitsSvc.bulkPriceAdjust(req.params.developmentId, req.params.workspaceId, {
      mode, value, zoneFilter, blockFilter,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:developmentId/units/import-csv', authenticate, workspaceContext, requirePermission('properties'), csvUpload.single('file'), async (req, res, next) => {
  try {
    let csvText;
    if (req.file) {
      csvText = req.file.buffer.toString('utf8');
    } else if (req.body && req.body.csv) {
      csvText = req.body.csv;
    } else {
      return res.status(400).json({ error: 'Envie um arquivo CSV via multipart (campo "file") ou texto via JSON (campo "csv")' });
    }
    const result = await unitsSvc.importCSV(
      req.params.developmentId, req.params.workspaceId,
      csvText, req.user.sub
    );
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ── Price Zones ──────────────────────────────────────────────────────────

router.get('/:developmentId/price-zones', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const zones = await unitsSvc.listZones(req.params.developmentId, req.params.workspaceId);
    res.json(zones);
  } catch (err) { next(err); }
});

router.post('/:developmentId/price-zones', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const zone = await unitsSvc.createZone(req.params.developmentId, req.params.workspaceId, req.body);
    res.status(201).json(zone);
  } catch (err) { next(err); }
});

router.put('/:developmentId/price-zones/:zoneId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const zone = await unitsSvc.updateZone(req.params.zoneId, req.params.developmentId, req.params.workspaceId, req.body);
    res.json(zone);
  } catch (err) { next(err); }
});

router.delete('/:developmentId/price-zones/:zoneId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await unitsSvc.deleteZone(req.params.zoneId, req.params.developmentId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:developmentId/price-zones/:zoneId/apply', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const zoneRes = await unitsSvc.listZones(req.params.developmentId, req.params.workspaceId);
    const zone = zoneRes.find(z => z.id === req.params.zoneId);
    if (!zone) return res.status(404).json({ error: 'Zona não encontrada' });
    const result = await unitsSvc.applyPriceZone(req.params.developmentId, req.params.workspaceId, zone.name, zone);
    res.json(result);
  } catch (err) { next(err); }
});

// ── Proposals ────────────────────────────────────────────────────────────

router.get('/:developmentId/proposals', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await proposalsSvc.list(req.params.developmentId, req.params.workspaceId, {
      status,
      page:  parseInt(page,  10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:developmentId/proposals', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const proposal = await proposalsSvc.create(
      req.params.developmentId, req.params.workspaceId,
      req.body, req.user.sub
    );
    res.status(201).json(proposal);
  } catch (err) { next(err); }
});

router.get('/:developmentId/proposals/:proposalId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const proposal = await proposalsSvc.getById(req.params.proposalId, req.params.workspaceId);
    res.json(proposal);
  } catch (err) { next(err); }
});

router.post('/:developmentId/proposals/:proposalId/approve', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const proposal = await proposalsSvc.approve(req.params.proposalId, req.params.workspaceId, req.user.sub);
    res.json(proposal);
  } catch (err) { next(err); }
});

router.post('/:developmentId/proposals/:proposalId/reject', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const proposal = await proposalsSvc.reject(req.params.proposalId, req.params.workspaceId, req.user.sub, reason);
    res.json(proposal);
  } catch (err) { next(err); }
});

module.exports = router;
