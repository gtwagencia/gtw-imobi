'use strict';

const { Router } = require('express');
const { google } = require('googleapis');
const { authenticate } = require('../../middleware/auth');
const gcal = require('../../services/google-calendar.service');

const router = Router();

// ── Status da integração ──────────────────────────────────────────────────────

router.get('/status', authenticate, async (req, res, next) => {
  try {
    const status = await gcal.getStatus(req.user.sub);
    res.json({ ...status, configured: gcal.isConfigured() });
  } catch (err) { next(err); }
});

// ── Inicia fluxo OAuth — retorna URL de autorização ───────────────────────────

router.get('/connect', authenticate, async (req, res, next) => {
  try {
    if (!gcal.isConfigured()) {
      return res.status(503).json({ error: 'Integração com Google não configurada no servidor.' });
    }
    const url = gcal.getAuthUrl(req.user.sub);
    res.json({ url });
  } catch (err) { next(err); }
});

// ── Callback do OAuth (Google redireciona aqui após autorização) ──────────────
// Não usa o middleware authenticate pois é chamado diretamente pelo Google.
// O userId vem no parâmetro `state` definido no getAuthUrl.

router.get('/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  const closePopup = (msg) =>
    res.send(`<!DOCTYPE html><html><body><script>
      window.opener && window.opener.postMessage('${msg}', '*');
      window.close();
    </script></body></html>`);

  if (error || !code || !userId) {
    return closePopup('google_calendar_error');
  }

  try {
    const client = gcal.getOAuthClient();
    const { tokens } = await client.getToken(String(code));

    // Busca o email da conta Google autorizada
    client.setCredentials(tokens);
    const oauth2    = google.oauth2({ version: 'v2', auth: client });
    const userInfo  = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email;

    await gcal.saveTokens(String(userId), tokens, googleEmail);

    closePopup('google_calendar_connected');
  } catch (err) {
    console.error('[gcal-router] callback error:', err.message);
    closePopup('google_calendar_error');
  }
});

// ── Desconectar ───────────────────────────────────────────────────────────────

router.delete('/disconnect', authenticate, async (req, res, next) => {
  try {
    await gcal.disconnect(req.user.sub);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Listar eventos do Google Calendar do usuário logado ───────────────────────

router.get('/events', authenticate, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Parâmetros from e to são obrigatórios' });
    const events = await gcal.listEvents(req.user.sub, String(from), String(to));
    res.json(events);
  } catch (err) { next(err); }
});

module.exports = router;
