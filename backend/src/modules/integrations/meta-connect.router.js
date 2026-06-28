'use strict';

/**
 * Meta Embedded Signup — conecta o WABA do cliente ao workspace.
 *
 * Fluxo:
 * 1. Frontend abre FB.login() com config_id do Embedded Signup
 * 2. Callback retorna um `code` de curta duração
 * 3. POST /connect: troca code → user token → long-lived token → salva WABA
 * 4. Se o usuário tiver múltiplos WABAs, retorna a lista para ele escolher
 * 5. POST /select-waba: confirma qual WABA usar
 * 6. DELETE /disconnect: desvincula o WABA do workspace
 */

const { Router } = require('express');
const axios      = require('axios');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const { query }            = require('../../config/database');
const logger               = require('../../utils/logger');

const router = Router({ mergeParams: true });

const APP_ID      = process.env.META_APP_ID;
const APP_SECRET  = process.env.META_APP_SECRET;
const API_VERSION = process.env.META_API_VERSION || 'v19.0';
const GRAPH_BASE  = `https://graph.facebook.com/${API_VERSION}`;

// ── Helpers ────────────────────────────────────────────────────────────────

async function exchangeCodeForToken(code, redirectUri) {
  const resp = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id:     APP_ID,
      client_secret: APP_SECRET,
      code,
      redirect_uri:  redirectUri || '',
    },
    timeout: 15000,
  });
  return resp.data.access_token;
}

async function getLongLivedToken(shortToken) {
  const resp = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type:        'fb_exchange_token',
      client_id:         APP_ID,
      client_secret:     APP_SECRET,
      fb_exchange_token: shortToken,
    },
    timeout: 15000,
  });
  return resp.data.access_token;
}

async function listWabaAccounts(accessToken) {
  const resp = await axios.get(`${GRAPH_BASE}/me/businesses`, {
    params: {
      access_token: accessToken,
      fields:       'id,name,whatsapp_business_accounts{id,name,phone_numbers{display_phone_number,verified_name}}',
    },
    timeout: 15000,
  });

  const wabas = [];
  for (const business of resp.data.data || []) {
    for (const waba of business.whatsapp_business_accounts?.data || []) {
      wabas.push({
        wabaId:      waba.id,
        wabaName:    waba.name,
        businessId:  business.id,
        businessName: business.name,
        phoneNumbers: waba.phone_numbers?.data || [],
      });
    }
  }
  return wabas;
}

// ── POST /connect ──────────────────────────────────────────────────────────
// Recebe o `code` do Embedded Signup, troca por token de longa duração,
// lista os WABAs e (se houver apenas um) conecta automaticamente.

router.post('/connect', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (!APP_ID || !APP_SECRET) {
      return res.status(503).json({ error: 'Integração Meta não configurada no servidor (META_APP_ID / META_APP_SECRET)' });
    }

    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ error: 'code é obrigatório' });

    // Troca code por token curto
    let shortToken;
    try {
      shortToken = await exchangeCodeForToken(code, redirectUri);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      logger.warn('meta-connect: falha ao trocar code por token', { msg });
      return res.status(400).json({ error: `Falha ao autenticar com Meta: ${msg}` });
    }

    // Converte para token de longa duração (~60 dias)
    let longToken;
    try {
      longToken = await getLongLivedToken(shortToken);
    } catch {
      longToken = shortToken; // usa o curto se a conversão falhar
    }

    // Lista WABAs do usuário
    let wabas = [];
    try {
      wabas = await listWabaAccounts(longToken);
    } catch (err) {
      logger.warn('meta-connect: falha ao listar WABAs', { err: err.message });
    }

    if (wabas.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma conta WhatsApp Business encontrada neste perfil Meta. Verifique se a conta tem permissão de admin na Business Manager.',
      });
    }

    // Se houver apenas um WABA, conecta automaticamente
    if (wabas.length === 1) {
      const waba = wabas[0];
      await query(
        `UPDATE workspaces SET meta_waba_id = $1, meta_access_token = $2, updated_at = NOW() WHERE id = $3`,
        [waba.wabaId, longToken, req.params.workspaceId]
      );
      logger.info('meta-connect: WABA conectado automaticamente', { wabaId: waba.wabaId, workspaceId: req.params.workspaceId });
      return res.json({ connected: true, waba, needsPick: false });
    }

    // Múltiplos WABAs: retorna lista + token temporário para o frontend escolher
    // O token é guardado no payload de resposta — o frontend vai enviar de volta no /select-waba
    return res.json({ connected: false, needsPick: true, wabas, _token: longToken });
  } catch (err) {
    next(err);
  }
});

// ── POST /select-waba ──────────────────────────────────────────────────────
// Chamado quando o usuário tem múltiplos WABAs e escolhe qual usar.

router.post('/select-waba', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { wabaId, accessToken } = req.body;
    if (!wabaId || !accessToken) {
      return res.status(400).json({ error: 'wabaId e accessToken são obrigatórios' });
    }

    await query(
      `UPDATE workspaces SET meta_waba_id = $1, meta_access_token = $2, updated_at = NOW() WHERE id = $3`,
      [wabaId, accessToken, req.params.workspaceId]
    );

    logger.info('meta-connect: WABA selecionado manualmente', { wabaId, workspaceId: req.params.workspaceId });
    res.json({ connected: true, wabaId });
  } catch (err) {
    next(err);
  }
});

// ── GET /status ────────────────────────────────────────────────────────────
// Verifica se o workspace já está conectado e retorna dados do WABA.

router.get('/status', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const wsRes = await query(
      `SELECT meta_waba_id, meta_access_token FROM workspaces WHERE id = $1`,
      [req.params.workspaceId]
    );
    const ws = wsRes.rows[0];
    if (!ws?.meta_waba_id || !ws?.meta_access_token) {
      return res.json({ connected: false });
    }

    // Tenta buscar detalhes do WABA na Meta para confirmar que o token ainda é válido
    try {
      const resp = await axios.get(`${GRAPH_BASE}/${ws.meta_waba_id}`, {
        params: {
          fields:       'id,name,phone_numbers{display_phone_number,verified_name,quality_rating}',
          access_token: ws.meta_access_token,
        },
        timeout: 10000,
      });
      return res.json({
        connected:    true,
        wabaId:       ws.meta_waba_id,
        wabaName:     resp.data.name,
        phoneNumbers: resp.data.phone_numbers?.data || [],
      });
    } catch {
      // Token expirado ou inválido
      return res.json({ connected: true, wabaId: ws.meta_waba_id, tokenExpired: true });
    }
  } catch (err) {
    next(err);
  }
});

// ── DELETE /disconnect ─────────────────────────────────────────────────────

router.delete('/disconnect', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.orgRole) && !req.user.isSuperAdmin && req.workspace?.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    await query(
      `UPDATE workspaces SET meta_waba_id = NULL, meta_access_token = NULL, updated_at = NOW() WHERE id = $1`,
      [req.params.workspaceId]
    );
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
