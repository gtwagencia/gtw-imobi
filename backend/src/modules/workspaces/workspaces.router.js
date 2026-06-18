'use strict';

const { Router } = require('express');
const { authenticate, requireOrgRole } = require('../../middleware/auth');
const { orgContext }                   = require('../../middleware/orgContext');
const { workspaceContext }             = require('../../middleware/workspaceContext');
const { logAudit, listForWorkspace }   = require('../../services/audit.service');
const { ALL_MODULES, MODULE_PRESETS }  = require('../../config/workspaceModules');
const svc = require('./workspaces.service');

// mergeParams so :orgId from parent router is available
const router = Router({ mergeParams: true });

/** Strip raw API keys and replace with boolean flags for safe frontend consumption. */
function sanitizeWorkspace(ws) {
  if (!ws) return ws;
  const { anthropic_api_key, openai_api_key, gemini_api_key, custom_ai_api_key, meta_conversions_token, meta_access_token, ...rest } = ws;
  return {
    ...rest,
    has_anthropic_key:          !!anthropic_api_key,
    has_openai_key:             !!openai_api_key,
    has_gemini_key:             !!gemini_api_key,
    has_custom_ai_key:          !!custom_ai_api_key,
    has_meta_conversions_token: !!meta_conversions_token,
    has_meta_access_token:      !!meta_access_token,
  };
}

// GET /orgs/:orgId/workspaces
router.get('/', authenticate, orgContext, async (req, res, next) => {
  try {
    const list = await svc.listForOrg(
      req.params.orgId,
      req.user.sub,
      req.user.isSuperAdmin,
      req.orgRole
    );
    res.json(list.map(sanitizeWorkspace));
  } catch (err) { next(err); }
});

// POST /orgs/:orgId/workspaces
router.post('/', authenticate, orgContext, requireOrgRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { name, logoUrl, timezone, businessModel, seedDemo } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const ws = await svc.create(req.params.orgId, { name, logoUrl, timezone, businessModel, seedDemo: !!seedDemo });
    res.status(201).json(ws);
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/workspaces/:workspaceId
router.get('/:workspaceId', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    res.json(sanitizeWorkspace(req.workspace));
  } catch (err) { next(err); }
});

// PUT /orgs/:orgId/workspaces/:workspaceId
router.put('/:workspaceId', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    // Somente superadmin pode alterar a quota de armazenamento
    if (req.body.ticketStorageQuotaMb !== undefined && !req.user.isSuperAdmin) {
      delete req.body.ticketStorageQuotaMb;
    }
    const ws = await svc.update(req.params.workspaceId, req.body);
    await logAudit({
      orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'workspace.update', entityType: 'workspace', entityId: req.params.workspaceId,
      metadata: { fields: Object.keys(req.body) }, ip: req.ip,
    });
    res.json(sanitizeWorkspace(ws));
  } catch (err) { next(err); }
});

// POST /orgs/:orgId/workspaces/:workspaceId/site-integration/regenerate-token
router.post('/:workspaceId/site-integration/regenerate-token', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const ws = await svc.regenerateSiteToken(req.params.workspaceId);
    await logAudit({
      orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'workspace.site_token_regenerated', entityType: 'workspace', entityId: req.params.workspaceId,
      ip: req.ip,
    });
    res.json(sanitizeWorkspace(ws));
  } catch (err) { next(err); }
});

// POST /orgs/:orgId/workspaces/:workspaceId/custom-domain/verify
router.post('/:workspaceId/custom-domain/verify', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { workspace, verified } = await svc.verifyCustomDomain(req.params.workspaceId);
    if (verified) {
      await logAudit({
        orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
        action: 'workspace.custom_domain_verified', entityType: 'workspace', entityId: req.params.workspaceId,
        metadata: { domain: workspace.custom_domain }, ip: req.ip,
      });
    }
    res.json(sanitizeWorkspace(workspace));
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/workspaces/:workspaceId/modules
router.get('/:workspaceId/modules', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    res.json({
      enabled:   await svc.getModules(req.params.workspaceId),
      available: ALL_MODULES,
      presets:   MODULE_PRESETS,
    });
  } catch (err) { next(err); }
});

// PUT /orgs/:orgId/workspaces/:workspaceId/modules
router.put('/:workspaceId/modules', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const enabled = await svc.updateModules(req.params.workspaceId, req.body.enabled);
    await logAudit({
      orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'workspace.modules_update', entityType: 'workspace', entityId: req.params.workspaceId,
      metadata: { enabled }, ip: req.ip,
    });
    res.json({ enabled });
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/workspaces/:workspaceId/audit-logs
router.get('/:workspaceId/audit-logs', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !['owner', 'admin'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem ver o log de auditoria' });
    }
    res.json(await listForWorkspace(req.params.workspaceId, { limit: 200 }));
  } catch (err) { next(err); }
});

// ── Members ────────────────────────────────────────────────────────────────

router.get('/:workspaceId/members', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    const members = await svc.listMembers(req.params.workspaceId);
    res.json(members);
  } catch (err) { next(err); }
});

router.post('/:workspaceId/members', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !['owner', 'admin'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { email, role, name } = req.body;
    if (!email) return res.status(400).json({ error: 'email é obrigatório' });
    const VALID_ROLES = ['admin', 'agent', 'member', 'tickets_only', 'captador', 'auxiliar_administrativo'];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role inválido. Use: ${VALID_ROLES.join(', ')}` });
    }
    const member = await svc.addMember(req.params.workspaceId, req.params.orgId, { email, role, name });
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.put('/:workspaceId/members/:userId/role', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    const { role } = req.body;
    const VALID_ROLES = ['admin', 'agent', 'member', 'tickets_only', 'captador', 'auxiliar_administrativo'];
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role inválido. Use: ${VALID_ROLES.join(', ')}` });
    }
    const member = await svc.updateMemberRole(req.params.workspaceId, req.params.userId, role);
    await logAudit({
      orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'member.role_changed', entityType: 'user', entityId: req.params.userId,
      metadata: { newRole: role }, ip: req.ip,
    });
    res.json(member);
  } catch (err) { next(err); }
});

router.put('/:workspaceId/members/:userId/profile', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    const isSelf    = req.user.sub === req.params.userId;
    const isManager = req.workspaceRole === 'admin' || ['owner', 'admin'].includes(req.orgRole) || req.user.isSuperAdmin;
    if (!isSelf && !isManager) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { creci, phone } = req.body;
    const member = await svc.updateMemberProfile(req.params.workspaceId, req.params.userId, { creci, phone });
    res.json(member);
  } catch (err) { next(err); }
});

router.delete('/:workspaceId/members/:userId', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeMember(req.params.workspaceId, req.params.userId);
    await logAudit({
      orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'member.removed', entityType: 'user', entityId: req.params.userId, ip: req.ip,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:workspaceId/members/:userId/reset-password', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !['owner', 'admin'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await svc.resetMemberPassword(req.params.workspaceId, req.params.userId);
    await logAudit({
      orgId: req.params.orgId, workspaceId: req.params.workspaceId, userId: req.user.sub,
      action: 'member.password_reset', entityType: 'user', entityId: req.params.userId, ip: req.ip,
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
