'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const { authenticate } = require('../../middleware/auth');
const svc = require('./auth.service');

const router = Router();

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Cookies de sessão ───────────────────────────────────────────────────────
// gtw_refresh: httpOnly — não acessível via JS, enviado apenas para /api/v1/auth/*
// gtw_csrf:    legível via JS — usado no padrão "double submit cookie" para
//              proteger /refresh e /logout contra CSRF

function setAuthCookies(res, refreshToken) {
  const csrfToken = crypto.randomBytes(32).toString('hex');

  res.cookie('gtw_refresh', refreshToken, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: 'lax',
    path:     '/api/v1/auth',
    maxAge:   REFRESH_TOKEN_TTL_MS,
  });
  res.cookie('gtw_csrf', csrfToken, {
    httpOnly: false,
    secure:   IS_PROD,
    sameSite: 'lax',
    path:     '/',
    maxAge:   REFRESH_TOKEN_TTL_MS,
  });

  return csrfToken;
}

function clearAuthCookies(res) {
  res.clearCookie('gtw_refresh', { path: '/api/v1/auth' });
  res.clearCookie('gtw_csrf',    { path: '/' });
}

function requireCsrf(req, res, next) {
  const header = req.headers['x-csrf-token'];
  const cookie = req.cookies?.gtw_csrf;
  if (!header || !cookie || header !== cookie) {
    return res.status(403).json({ error: 'CSRF token inválido' });
  }
  next();
}

function sendSession(res, status, { refreshToken, ...rest }) {
  const csrfToken = setAuthCookies(res, refreshToken);
  res.status(status).json({ ...rest, csrfToken });
}

// ── Sessão ──────────────────────────────────────────────────────────────────

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, orgName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email e password são obrigatórios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });
    }
    const data = await svc.register({ name, email, password, orgName });
    sendSession(res, 201, data);
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email e password são obrigatórios' });
    }
    const data = await svc.login({ email, password });
    if (data.twoFactorRequired) {
      return res.json({ twoFactorRequired: true, challenge: data.challenge });
    }
    sendSession(res, 200, data);
  } catch (err) { next(err); }
});

router.post('/login/2fa', async (req, res, next) => {
  try {
    const { challenge, code } = req.body;
    if (!challenge || !code) {
      return res.status(400).json({ error: 'challenge e code são obrigatórios' });
    }
    const data = await svc.verifyTwoFactorLogin({ challenge, code });
    sendSession(res, 200, data);
  } catch (err) { next(err); }
});

router.post('/refresh', requireCsrf, async (req, res, next) => {
  try {
    const rawToken = req.cookies?.gtw_refresh;
    const data = await svc.refresh(rawToken);
    sendSession(res, 200, data);
  } catch (err) {
    clearAuthCookies(res);
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.gtw_refresh;
    await svc.logout(rawToken);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Perfil ──────────────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await svc.me(req.user.sub);
    res.json(user);
  } catch (err) { next(err); }
});

router.put('/me/profile', authenticate, async (req, res, next) => {
  try {
    const { name, avatarUrl } = req.body;
    const user = await svc.updateProfile(req.user.sub, { name, avatarUrl });
    res.json(user);
  } catch (err) { next(err); }
});

router.put('/me/password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword e newPassword obrigatórios' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter ao menos 8 caracteres' });
    }
    await svc.changePassword(req.user.sub, { currentPassword, newPassword });
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Aceitar convite com novo cadastro ────────────────────────────────────────

router.post('/invitations/:token/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email e password são obrigatórios' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });
    }
    const data = await svc.registerViaInvite({ name, email, password, token: req.params.token });
    sendSession(res, 201, data);
  } catch (err) { next(err); }
});

// ── 2FA (verificação em duas etapas) ─────────────────────────────────────────

router.get('/2fa/status', authenticate, async (req, res, next) => {
  try {
    res.json(await svc.getTwoFactorStatus(req.user.sub));
  } catch (err) { next(err); }
});

router.post('/2fa/setup', authenticate, async (req, res, next) => {
  try {
    res.json(await svc.setupTwoFactor(req.user.sub));
  } catch (err) { next(err); }
});

router.post('/2fa/enable', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código obrigatório' });
    res.json(await svc.enableTwoFactor(req.user.sub, code));
  } catch (err) { next(err); }
});

router.post('/2fa/disable', authenticate, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
    await svc.disableTwoFactor(req.user.sub, password);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
