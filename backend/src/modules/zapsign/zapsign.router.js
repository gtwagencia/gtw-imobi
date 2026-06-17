'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./zapsign.service');

const router = Router({ mergeParams: true });

// Enviar proposta para assinatura eletrônica
router.post('/proposals/:proposalId/sign', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const result = await svc.sendProposalForSignature(req.params.workspaceId, req.params.proposalId);
    res.json(result);
  } catch (err) { next(err); }
});

// Webhook público (ZapSign chama este endpoint quando documento é assinado)
router.post('/webhook', async (req, res) => {
  try {
    await svc.handleWebhook(req.body);
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

module.exports = router;
