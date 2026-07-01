'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const { query }  = require('../../config/database');
const svc = require('./praedium.service');

const router = Router({ mergeParams: true });

function requireAdmin(req, res, next) {
  if (req.workspaceRole !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem configurar esta integração' });
  next();
}

function sanitize(cfg) {
  if (!cfg) return null;
  const { access_token, inbound_token, ...rest } = cfg;
  return {
    ...rest,
    has_access_token: !!access_token,
    has_inbound_token: !!inbound_token,
    inbound_token_preview: inbound_token ? `••••${inbound_token.slice(-4)}` : null,
  };
}

// GET /workspaces/:workspaceId/integrations/praedium
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const cfg = await svc.getConfig(req.params.workspaceId);
    res.json(sanitize(cfg));
  } catch (err) { next(err); }
});

// PUT /workspaces/:workspaceId/integrations/praedium
router.put('/', authenticate, workspaceContext, requireAdmin, async (req, res, next) => {
  try {
    const cfg = await svc.saveConfig(req.params.workspaceId, req.body);
    res.json(sanitize(cfg));
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/integrations/praedium/regenerate-token
router.post('/regenerate-token', authenticate, workspaceContext, requireAdmin, async (req, res, next) => {
  try {
    const cfg = await svc.regenerateInboundToken(req.params.workspaceId);
    res.json(sanitize(cfg));
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/integrations/praedium/send — envio manual pelo corretor
router.post('/send', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { conversationId, propertyCode, summary } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId é obrigatório' });

    const convRes = await query(
      'SELECT id, contact_id FROM conversations WHERE id = $1 AND workspace_id = $2',
      [conversationId, req.params.workspaceId]
    );
    const conversation = convRes.rows[0];
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

    let resolvedPropertyCode = propertyCode || null;
    if (!resolvedPropertyCode) {
      const dealRes = await query('SELECT id FROM deals WHERE conversation_id = $1', [conversationId]);
      if (dealRes.rows[0]) {
        resolvedPropertyCode = await svc.resolveOfferedPropertyCode(dealRes.rows[0].id);
      }
    }

    const result = await svc.sendLead(req.params.workspaceId, {
      contactId: conversation.contact_id,
      propertyCode: resolvedPropertyCode,
      summary: summary || null,
    });

    await query(
      `UPDATE conversations SET bot_handoff_summary = COALESCE($1, bot_handoff_summary), status = 'resolved', bot_active = false WHERE id = $2`,
      [summary || null, conversationId]
    );
    const io = req.app.get('io');
    const payload = { conversationId, status: 'resolved', botActive: false };
    io?.to(`ws:${req.params.workspaceId}`).emit('conversation:updated', payload);
    io?.to(`conv:${conversationId}`).emit('conversation:updated', payload);

    res.json({ ok: true, praedium: result });
  } catch (err) { next(err); }
});

module.exports = router;
