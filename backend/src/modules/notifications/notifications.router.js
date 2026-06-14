'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./notifications.service');

const router = Router({ mergeParams: true });

const auth = [authenticate, workspaceContext];

// GET /notifications — alertas internos não lidos do usuário logado
// (SLA de resposta vencido, lead sem retorno...)
router.get('/', ...auth, async (req, res, next) => {
  try {
    res.json(await svc.listMine(req.params.workspaceId, req.user.sub));
  } catch (err) { next(err); }
});

router.put('/read-all', ...auth, async (req, res, next) => {
  try {
    await svc.markAllRead(req.params.workspaceId, req.user.sub);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/:id/read', ...auth, async (req, res, next) => {
  try {
    await svc.markRead(req.params.id, req.user.sub);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
