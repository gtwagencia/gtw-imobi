'use strict';

/**
 * Acesso público (sem autenticação) ao comparativo de imóveis via token —
 * usado para gerar um link que pode ser enviado ao cliente.
 *
 * GET /api/v1/comparisons/:token
 */

const { Router } = require('express');
const svc = require('./comparisons.service');

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const comparison = await svc.getByToken(req.params.token);
    res.json(comparison);
  } catch (err) { next(err); }
});

module.exports = router;
