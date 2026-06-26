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

// ── Envio de push de teste para o usuário atual ────────────────────────────────

router.post('/test', authenticate, async (req, res, next) => {
  try {
    if (!pushSvc.isConfigured()) {
      return res.status(503).json({ error: 'VAPID não configurado no servidor' });
    }
    await pushSvc.sendToUser(req.user.sub, {
      title: 'Notificação de teste',
      body:  'Se você está vendo isso, o push está funcionando!',
      url:   '/dashboard',
      tag:   'push-test',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
