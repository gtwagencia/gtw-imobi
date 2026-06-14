'use strict';

const { Router } = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const storageSvc = require('../../services/storage.service');
const svc = require('./developments.service');

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

module.exports = router;
