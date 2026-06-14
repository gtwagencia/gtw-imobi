'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const pushSvc = require('../../services/push.service');

const router = Router();

// ── Chave pública VAPID (necessária para o navegador inscrever o push) ────────

router.get('/vapid-public-key', authenticate, (req, res) => {
  res.json({ publicKey: pushSvc.getPublicKey() });
});

// ── Inscrever este dispositivo para receber push ──────────────────────────────

router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    await pushSvc.subscribe(req.user.sub, req.body);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Cancelar inscrição deste dispositivo ───────────────────────────────────────

router.post('/unsubscribe', authenticate, async (req, res, next) => {
  try {
    await pushSvc.unsubscribe(req.user.sub, req.body?.endpoint);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
