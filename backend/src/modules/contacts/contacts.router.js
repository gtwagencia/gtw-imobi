'use strict';

const { Router } = require('express');
const multer               = require('multer');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext, requirePermission } = require('../../middleware/workspaceContext');
const { logAudit }         = require('../../services/audit.service');
const svc = require('./contacts.service');
const portalSvc = require('./portal.service');

const router  = Router({ mergeParams: true });
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const { search, tags, contactType, brokerId, page, limit } = req.query;
    const tagsArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    const contactTypeArr = contactType ? contactType.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    const result = await svc.list(req.params.workspaceId, {
      search:      search?.slice(0, 200),
      tags:        tagsArr,
      contactType: contactTypeArr,
      brokerId:    brokerId || undefined,
      page:        parseInt(page,  10) || 1,
      limit:       Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const contact = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(contact);
  } catch (err) { next(err); }
});

// GET /contacts/duplicates — agrupa contatos que compartilham o mesmo telefone
// normalizado (mesma pessoa cadastrada por canais/formatos diferentes)
router.get('/duplicates', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const groups = await svc.listDuplicates(req.params.workspaceId);
    res.json(groups);
  } catch (err) { next(err); }
});

// POST /contacts/merge — mescla um contato duplicado no contato principal
router.post('/merge', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem mesclar contatos' });
    }
    const { primaryId, duplicateId } = req.body;
    if (!primaryId || !duplicateId) {
      return res.status(400).json({ error: 'primaryId e duplicateId são obrigatórios' });
    }
    const merged = await svc.mergeContacts(req.params.workspaceId, primaryId, duplicateId);
    await logAudit({
      orgId: req.workspace.org_id, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'contact.merge', entityType: 'contact', entityId: primaryId,
      metadata: { duplicateId }, ip: req.ip,
    });
    res.json(merged);
  } catch (err) { next(err); }
});

router.get('/:contactId', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const c = await svc.getById(req.params.contactId, req.params.workspaceId);
    if (!c) return res.status(404).json({ error: 'Contato não encontrado' });
    res.json(c);
  } catch (err) { next(err); }
});

router.put('/:contactId', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const c = await svc.update(req.params.contactId, req.params.workspaceId, req.body);
    res.json(c);
  } catch (err) { next(err); }
});

router.delete('/:contactId', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    await svc.remove(req.params.contactId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Portal do cliente (área logada do comprador) ──────────────────────────

router.post('/:contactId/portal-access', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const result = await portalSvc.grantAccess(req.params.contactId, req.params.workspaceId);
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/:contactId/portal-access', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    await portalSvc.revokeAccess(req.params.contactId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:contactId/conversations', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const convs = await svc.listConversations(req.params.contactId, req.params.workspaceId);
    res.json(convs);
  } catch (err) { next(err); }
});

// POST /contacts/import — importação via CSV
router.post('/import', authenticate, workspaceContext, requirePermission('contacts'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo CSV obrigatório' });
    const csv        = req.file.buffer.toString('utf-8');
    const defaultTag = req.body?.defaultTag?.trim() || undefined;
    const result     = await svc.csvImport(req.params.workspaceId, csv, { defaultTag });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
