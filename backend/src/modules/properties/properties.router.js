'use strict';

const { Router } = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const storageSvc = require('../../services/storage.service');
const svc = require('./properties.service');
const docsSvc = require('./documents.service');
const salesSvc = require('./sales.service');
const exchangesSvc = require('./exchanges.service');
const proposalsSvc = require('./proposals.service');
const aiSvc = require('../../services/ai.service');

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};

router.get('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { search, type, purpose, status, city, minPrice, maxPrice, bedrooms, ownerId, brokerId, page, limit } = req.query;
    const result = await svc.list(req.params.workspaceId, {
      search: search?.slice(0, 200),
      type, purpose, status,
      city: city?.slice(0, 100),
      minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      bedrooms: bedrooms ? parseInt(bedrooms, 10) : undefined,
      ownerId, brokerId,
      page:  parseInt(page,  10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title é obrigatório' });
    const property = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(property);
  } catch (err) { next(err); }
});

router.get('/:propertyId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const p = await svc.getById(req.params.propertyId, req.params.workspaceId);
    if (!p) return res.status(404).json({ error: 'Imóvel não encontrado' });
    res.json(p);
  } catch (err) { next(err); }
});

router.put('/:propertyId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const p = await svc.update(req.params.propertyId, req.params.workspaceId, req.body);
    res.json(p);
  } catch (err) { next(err); }
});

router.delete('/:propertyId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.remove(req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Geração de descrição com IA ─────────────────────────────────────────

// Para imóvel existente
router.post('/:propertyId/generate-description', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { query } = require('../../config/database');
    const wsRow = await query('SELECT * FROM workspaces WHERE id = $1', [req.params.workspaceId]);
    const workspace = wsRow.rows[0];
    if (!workspace) return res.status(404).json({ error: 'Workspace não encontrado' });

    const property = await svc.getById(req.params.propertyId, req.params.workspaceId);
    if (!property) return res.status(404).json({ error: 'Imóvel não encontrado' });

    const description = await aiSvc.generatePropertyDescription(workspace, property);
    res.json({ description });
  } catch (err) { next(err); }
});

// Para imóvel novo (ainda sem ID) — recebe características no body
router.post('/generate-description', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { query } = require('../../config/database');
    const wsRow = await query('SELECT * FROM workspaces WHERE id = $1', [req.params.workspaceId]);
    const workspace = wsRow.rows[0];
    if (!workspace) return res.status(404).json({ error: 'Workspace não encontrado' });

    const description = await aiSvc.generatePropertyDescription(workspace, req.body);
    res.json({ description });
  } catch (err) { next(err); }
});

// ── Galeria de mídia ─────────────────────────────────────────────────────

router.post('/:propertyId/media', authenticate, workspaceContext, requirePermission('properties'), upload.single('file'), async (req, res, next) => {
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

    const media = await svc.addMedia(req.params.propertyId, req.params.workspaceId, { url, mediaType });
    res.status(201).json(media);
  } catch (err) { next(err); }
});

router.delete('/:propertyId/media/:mediaId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.removeMedia(req.params.mediaId, req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:propertyId/media/reorder', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { mediaIds } = req.body;
    if (!Array.isArray(mediaIds)) return res.status(400).json({ error: 'mediaIds deve ser um array' });
    await svc.reorderMedia(req.params.propertyId, req.params.workspaceId, mediaIds);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:propertyId/media/:mediaId/cover', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await svc.setCover(req.params.mediaId, req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:propertyId/media/:mediaId/show-on-site', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { showOnSite } = req.body;
    await svc.setShowOnSite(req.params.mediaId, req.params.propertyId, req.params.workspaceId, !!showOnSite);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Condições de venda/pagamento da unidade ───────────────────────────────

router.get('/:propertyId/sale', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const sale = await salesSvc.getByProperty(req.params.propertyId, req.params.workspaceId);
    res.json(sale);
  } catch (err) { next(err); }
});

router.put('/:propertyId/sale', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const sale = await salesSvc.upsert(req.params.propertyId, req.params.workspaceId, req.body, req.user.sub);
    res.json(sale);
  } catch (err) { next(err); }
});

router.delete('/:propertyId/sale', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await salesSvc.remove(req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Permutas (imóveis recebidos como parte do pagamento) ──────────────────

router.get('/:propertyId/sale/exchanges', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const exchanges = await exchangesSvc.list(req.params.propertyId, req.params.workspaceId);
    res.json(exchanges);
  } catch (err) { next(err); }
});

router.post('/:propertyId/sale/exchanges', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const exchange = await exchangesSvc.create(req.params.propertyId, req.params.workspaceId, req.body);
    res.status(201).json(exchange);
  } catch (err) { next(err); }
});

router.put('/:propertyId/sale/exchanges/:exchangeId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const exchange = await exchangesSvc.update(req.params.exchangeId, req.params.propertyId, req.params.workspaceId, req.body);
    res.json(exchange);
  } catch (err) { next(err); }
});

router.delete('/:propertyId/sale/exchanges/:exchangeId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await exchangesSvc.remove(req.params.exchangeId, req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Propostas/contratos (PDF + assinatura eletrônica) ─────────────────────

router.get('/:propertyId/proposals', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const proposals = await proposalsSvc.list(req.params.propertyId, req.params.workspaceId);
    res.json(proposals);
  } catch (err) { next(err); }
});

router.post('/:propertyId/proposals', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const proposal = await proposalsSvc.create(req.params.propertyId, req.params.workspaceId, req.body, req.user.sub);
    res.status(201).json(proposal);
  } catch (err) { next(err); }
});

router.put('/:propertyId/proposals/:proposalId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const proposal = await proposalsSvc.updateStatus(req.params.proposalId, req.params.propertyId, req.params.workspaceId, req.body.status);
    res.json(proposal);
  } catch (err) { next(err); }
});

router.delete('/:propertyId/proposals/:proposalId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await proposalsSvc.remove(req.params.proposalId, req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── QR Code para placa "vende-se" ─────────────────────────────────────────

router.get('/:propertyId/sign-qrcode', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const result = await svc.generateSignQrCode(req.params.propertyId, req.params.workspaceId);
    res.json(result);
  } catch (err) { next(err); }
});

// ── Avaliação automática de preço (CMA) ──────────────────────────────────

router.post('/:propertyId/cma', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const property = await aiSvc.generateCMA(req.params.propertyId, req.params.workspaceId);
    res.json(property);
  } catch (err) { next(err); }
});

// ── Cofre de documentos ──────────────────────────────────────────────────

router.get('/:propertyId/documents', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const docs = await docsSvc.list(req.params.propertyId, req.params.workspaceId);
    res.json(docs);
  } catch (err) { next(err); }
});

router.post('/:propertyId/documents', authenticate, workspaceContext, requirePermission('properties'), docUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const { name, category, expiresAt } = req.body;
    const ext      = path.extname(req.file.originalname).toLowerCase() || '.bin';
    const filename = `${uuidv4()}${ext}`;
    const url      = await storageSvc.uploadFile(req.file.buffer, filename, req.file.mimetype);

    const doc = await docsSvc.create(req.params.propertyId, req.params.workspaceId, {
      name:      name || req.file.originalname,
      category,
      fileUrl:   url,
      fileType:  req.file.mimetype,
      expiresAt: expiresAt || null,
    }, req.user.sub);
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.put('/:propertyId/documents/:documentId/visibility', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    const { isClientVisible } = req.body;
    await docsSvc.setClientVisible(req.params.documentId, req.params.propertyId, req.params.workspaceId, !!isClientVisible);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:propertyId/documents/:documentId', authenticate, workspaceContext, requirePermission('properties'), async (req, res, next) => {
  try {
    await docsSvc.remove(req.params.documentId, req.params.propertyId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
