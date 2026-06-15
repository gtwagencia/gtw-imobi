'use strict';

/**
 * Acesso público (sem autenticação) à proposta/contrato via token —
 * usado para o comprador visualizar e assinar eletronicamente.
 *
 * GET  /api/v1/proposals/:token
 * POST /api/v1/proposals/:token/sign
 */

const { Router } = require('express');
const svc = require('./proposals.service');

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const proposal = await svc.getByToken(req.params.token);
    res.json(proposal);
  } catch (err) { next(err); }
});

router.post('/:token/sign', async (req, res, next) => {
  try {
    const { name, document } = req.body;
    const proposal = await svc.sign(req.params.token, { name, document }, req.ip);
    res.json(proposal);
  } catch (err) { next(err); }
});

module.exports = router;
