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
    const { search, tags, contactType, brokerId, page, limit,
            aiCity, aiDevelopment, aiPerfil, aiTipoImovel, hasAiProfile } = req.query;
    const tagsArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    const contactTypeArr = contactType ? contactType.split(',').map(t => t.trim()).filter(Boolean) : undefined;
    const result = await svc.list(req.params.workspaceId, {
      search:        search?.slice(0, 200),
      tags:          tagsArr,
      contactType:   contactTypeArr,
      brokerId:      brokerId || undefined,
      aiCity:        aiCity || undefined,
      aiDevelopment: aiDevelopment || undefined,
      aiPerfil:      aiPerfil || undefined,
      aiTipoImovel:  aiTipoImovel || undefined,
      hasAiProfile:  hasAiProfile === 'true' ? true : undefined,
      page:          parseInt(page,  10) || 1,
      limit:         Math.min(parseInt(limit, 10) || 50, 200),
    });
    const isAdmin = req.workspaceRole === 'admin';
    if (!isAdmin && result.data) result.data = result.data.map(svc.stripAdminFields);
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
    const isAdmin = req.workspaceRole === 'admin';
    res.json(isAdmin ? c : svc.stripAdminFields(c));
  } catch (err) { next(err); }
});

router.put('/:contactId', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const c = await svc.update(req.params.contactId, req.params.workspaceId, req.body);
    logAudit({
      workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'contact.updated', entityType: 'contact', entityId: c.id,
      entityName: c.name, metadata: { fields: Object.keys(req.body) }, ip: req.ip,
    });
    res.json(c);
  } catch (err) { next(err); }
});

router.delete('/:contactId', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const c = await svc.getById(req.params.contactId, req.params.workspaceId);
    await svc.remove(req.params.contactId, req.params.workspaceId);
    logAudit({
      workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'contact.deleted', entityType: 'contact', entityId: req.params.contactId,
      entityName: c?.name || req.params.contactId, ip: req.ip,
    });
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

// PATCH /contacts/:contactId/lead-profile — campos admin-only (lead_status, client_type, client_development_id)
router.patch('/:contactId/lead-profile', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem alterar o perfil do lead' });
    }
    const { leadStatus, clientType, clientDevelopmentId } = req.body;
    const c = await svc.updateLeadProfile(req.params.contactId, req.params.workspaceId, { leadStatus, clientType, clientDevelopmentId });
    res.json(c);
  } catch (err) { next(err); }
});

// PATCH /contacts/:contactId/ai-profile — atualiza perfil de IA (merge parcial)
router.patch('/:contactId/ai-profile', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const c = await svc.updateAiProfile(req.params.contactId, req.params.workspaceId, req.body);
    res.json(c);
  } catch (err) { next(err); }
});

// POST /contacts/mass-message — dispara mensagem para lista de contatos
router.post('/mass-message', authenticate, workspaceContext, requirePermission('contacts'), async (req, res, next) => {
  try {
    const { contactIds, message, inboxId } = req.body;
    if (!contactIds?.length) return res.status(400).json({ error: 'contactIds obrigatório' });
    if (!message?.trim())    return res.status(400).json({ error: 'message obrigatório' });

    const { query: dbQuery } = require('../../config/database');
    const messagesSvc = require('../messages/messages.service');

    let sent = 0;
    const errors = [];

    for (const contactId of contactIds) {
      try {
        const contact = await svc.getById(contactId, req.params.workspaceId);
        if (!contact) continue;

        // Busca ou cria conversa ativa para este contato no inbox especificado
        let convRow;
        if (inboxId) {
          const existing = await dbQuery(
            `SELECT id FROM conversations WHERE contact_id = $1 AND inbox_id = $2 AND workspace_id = $3
             ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
            [contactId, inboxId, req.params.workspaceId]
          );
          convRow = existing.rows[0];
        }

        if (!convRow) {
          const convRes = await dbQuery(
            `SELECT id FROM conversations WHERE contact_id = $1 AND workspace_id = $2
             ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
            [contactId, req.params.workspaceId]
          );
          convRow = convRes.rows[0];
        }

        if (!convRow) { errors.push({ contactId, error: 'Sem conversa ativa' }); continue; }

        await messagesSvc.send(convRow.id, req.user.sub, { content: message, messageType: 'text' });
        sent++;
      } catch (err) {
        errors.push({ contactId, error: err.message });
      }
    }

    res.json({ sent, errors });
  } catch (err) { next(err); }
});

// POST /contacts/:contactId/attempts — registra tentativa de contato (ligação/whatsapp/email)
// Não exige permissão contacts — qualquer membro do workspace pode registrar a própria tentativa
router.post('/:contactId/attempts', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { channel, dealId } = req.body;
    if (!['call', 'whatsapp', 'email'].includes(channel)) {
      return res.status(400).json({ error: 'channel deve ser call, whatsapp ou email' });
    }
    const { query: dbQuery } = require('../../config/database');
    const r = await dbQuery(
      `INSERT INTO contact_attempts (workspace_id, contact_id, deal_id, broker_id, channel)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.workspaceId, req.params.contactId, dealId || null, req.user.sub, channel]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

// GET /contacts/:contactId/attempts — histórico de tentativas de contato
router.get('/:contactId/attempts', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { query: dbQuery } = require('../../config/database');
    const r = await dbQuery(
      `SELECT ca.*, u.name AS broker_name
       FROM contact_attempts ca
       JOIN users u ON u.id = ca.broker_id
       WHERE ca.contact_id = $1 AND ca.workspace_id = $2
       ORDER BY ca.created_at DESC
       LIMIT 100`,
      [req.params.contactId, req.params.workspaceId]
    );
    res.json(r.rows);
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
