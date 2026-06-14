'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const { PERMISSION_MODULES } = require('../../config/permissionModules');
const { logAudit } = require('../../services/audit.service');
const svc = require('./permissions.service');

const router = Router({ mergeParams: true });

// Permissões efetivas do usuário logado (qualquer membro do workspace)
router.get('/me', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const permissions = await svc.getEffectivePermissions(req.workspace.id, req.workspaceRole);
    res.json({ role: req.workspaceRole, permissions });
  } catch (err) { next(err); }
});

// Lista completa dos perfis (admin)
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem ver os perfis de permissão' });
    }
    res.json({ modules: PERMISSION_MODULES, profiles: await svc.listProfiles(req.workspace.id) });
  } catch (err) { next(err); }
});

// Atualiza permissões de um perfil (admin)
router.put('/:profileId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem editar permissões' });
    }
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'permissions é obrigatório' });
    }
    const result = await svc.updateProfile(req.workspace.id, req.params.profileId, permissions);
    await logAudit({
      orgId: req.workspace.org_id, workspaceId: req.workspace.id, userId: req.user.sub,
      action: 'permission_profile.update', entityType: 'permission_profile', entityId: req.params.profileId,
      metadata: { permissions }, ip: req.ip,
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
