'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { query }        = require('../../config/database');
const { testConnection } = require('../../services/mail');

const router = Router();

/**
 * POST /integrations/mail/test
 * Envia um e-mail de teste para o endereço do usuário logado.
 * Retorna detalhes do erro em caso de falha para facilitar o diagnóstico.
 */
router.post('/test', authenticate, async (req, res) => {
  try {
    // Busca o e-mail do usuário logado
    const userRes = await query('SELECT email, name FROM users WHERE id = $1', [req.user.sub]);
    const user    = userRes.rows[0];
    if (!user?.email) {
      return res.status(400).json({ ok: false, error: 'Usuário sem e-mail cadastrado.' });
    }

    await testConnection(user.email);

    res.json({
      ok:      true,
      message: `E-mail de teste enviado para ${user.email}`,
    });
  } catch (err) {
    // Devolve mensagem detalhada para facilitar diagnóstico
    res.status(500).json({
      ok:    false,
      error: err.message,
      hint:  diagnoseSmtpError(err.message),
    });
  }
});

/**
 * GET /integrations/mail/status
 * Retorna se as variáveis SMTP estão configuradas (sem expor valores).
 */
router.get('/status', authenticate, async (req, res) => {
  res.json({
    configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
    host:       process.env.SMTP_HOST   ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}` : null,
    from:       process.env.SMTP_FROM   || null,
    user:       process.env.SMTP_USER   ? maskEmail(process.env.SMTP_USER) : null,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return local.slice(0, 2) + '***@' + domain;
}

function diagnoseSmtpError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('econnrefused'))   return 'Conexão recusada — verifique SMTP_HOST e SMTP_PORT.';
  if (m.includes('enotfound'))      return 'Host não encontrado — verifique o valor de SMTP_HOST.';
  if (m.includes('etimedout'))      return 'Timeout — o servidor SMTP não respondeu. Verifique host/porta/firewall.';
  if (m.includes('auth') || m.includes('535') || m.includes('invalid credentials'))
                                    return 'Autenticação falhou — verifique SMTP_USER e SMTP_PASS.';
  if (m.includes('self signed'))    return 'Certificado SSL inválido — tente SMTP_PORT=587 (TLS) em vez de 465.';
  if (m.includes('535-5.7.8'))      return 'Gmail: ative "Senhas de app" nas configurações de segurança da conta Google.';
  return 'Verifique as variáveis SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.';
}

module.exports = router;
