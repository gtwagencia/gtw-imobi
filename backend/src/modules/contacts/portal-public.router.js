'use strict';

/**
 * Acesso público (sem autenticação) ao portal do cliente via token —
 * permite que o comprador acompanhe sua compra, documentos e obra.
 *
 * GET /api/v1/portal/:token
 */

const { Router } = require('express');
const svc = require('./portal.service');

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const data = await svc.getPortalData(req.params.token);
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
