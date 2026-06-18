'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');
const cors       = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit  = require('express-rate-limit');

const jwt = require('jsonwebtoken');

const { initDatabase } = require('./config/database');
const { ensureBucket } = require('./services/storage.service');
const { regenerateDomainsConfig } = require('./services/traefik.service');
const logger           = require('./utils/logger');
const { startJobs }    = require('./jobs/followUp.job');

const { requireNotTicketsOnly } = require('./middleware/workspaceContext');
const { corsOriginValidator }   = require('./middleware/corsConfig');
const authRouter          = require('./modules/auth/auth.router');
const orgsRouter          = require('./modules/organizations/organizations.router');
const workspacesRouter    = require('./modules/workspaces/workspaces.router');
const inboxesRouter       = require('./modules/inboxes/inboxes.router');
const contactsRouter      = require('./modules/contacts/contacts.router');
const propertiesRouter    = require('./modules/properties/properties.router');
const propertiesFeedRouter = require('./modules/properties/properties-feed.router');
const comparisonsRouter   = require('./modules/properties/comparisons.router');
const partnerBrokersRouter = require('./modules/properties/partner-brokers.router');
const comparisonsPublicRouter = require('./modules/properties/comparisons-public.router');
const proposalsPublicRouter = require('./modules/properties/proposals-public.router');
const portalPublicRouter = require('./modules/contacts/portal-public.router');
const developmentsRouter  = require('./modules/developments/developments.router');
const visitsRouter        = require('./modules/visits/visits.router');
const conversationsRouter = require('./modules/conversations/conversations.router');
const messagesRouter      = require('./modules/messages/messages.router');
const webhooksRouter      = require('./modules/webhooks/webhooks.router');
const metaRouter          = require('./modules/meta/meta.router');
const kanbanRouter        = require('./modules/kanban/kanban.router');
const pipelinesRouter     = require('./modules/pipelines/pipelines.router');
const departmentsRouter   = require('./modules/departments/departments.router');
const cannedRouter        = require('./modules/canned-responses/canned-responses.router');
const labelsRouter        = require('./modules/labels/labels.router');
const reportsRouter       = require('./modules/reports/reports.router');
const templatesRouter     = require('./modules/templates/templates.router');
const uploadsRouter       = require('./modules/uploads/uploads.router');
const ticketsRouter       = require('./modules/tickets/tickets.router');
const googleCalendarRouter = require('./modules/integrations/google-calendar.router');
const mailIntegrationRouter = require('./modules/integrations/mail.router');
const broadcastsRouter     = require('./modules/broadcasts/broadcasts.router');
const permissionsRouter    = require('./modules/permissions/permissions.router');
const notificationsRouter  = require('./modules/notifications/notifications.router');
const pushRouter           = require('./modules/push/push.router');
const npsRouter            = require('./modules/nps/nps.router');
const zapsignRouter        = require('./modules/zapsign/zapsign.router');
const importsRouter        = require('./modules/imports/imports.router');
const aiAgentRouter         = require('./modules/ai-agent/ai-agent.router');
const partnerAgenciesRouter = require('./modules/partner-agencies/partner-agencies.router');
const partnerPortalRouter   = require('./modules/partner-agencies/partner-portal.router');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    credentials: true,
  },
});

app.set('io', io);

// Confia no proxy Traefik para X-Forwarded-For (necessário para rate limiting)
app.set('trust proxy', 1);

// ── Static uploads ────────────────────────────────────────────────────────
const path = require('path');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Security & parsing ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      corsOriginValidator,
  credentials: true,
}));
app.use(cookieParser());
// Webhooks da Evolution API enviam mídia em base64 dentro do JSON — vídeos/áudios
// próximos do limite de 16MB do WhatsApp passam de 20MB já em base64, excedendo
// o limite padrão de 10mb e causando perda silenciosa dessas mensagens.
app.use('/api/v1/webhooks', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
const authLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// Endpoint server-to-server (Evolution API → backend). Múltiplas instâncias Evolution
// no mesmo servidor compartilham o mesmo IP de origem, e cada mensagem de WhatsApp gera
// vários eventos (upsert + updates de status + presence). 30/min (0.5 req/s) era
// insuficiente com 3+ conexões ativas e causava 429 → retry da Evolution → atraso de
// minutos para a conversa atualizar no painel.
const webhookLimiter  = rateLimit({ windowMs: 1 * 60 * 1000, max: 10000 }); // ~167 req/s por IP
// Formulário público do site — mais restrito para evitar leads falsos em massa
const siteLeadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }); // 30 leads/15min por IP
const uploadLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 60  }); // 4 uploads/min
const csatLimiter     = rateLimit({ windowMs: 60 * 60 * 1000, max: 10  }); // 10 por hora
app.use('/api/v1/auth/login',             authLimiter);
app.use('/api/v1/auth/register',          authLimiter);
app.use('/api/v1/webhooks',               webhookLimiter);
app.use('/api/v1/webhooks/site-leads',    siteLeadLimiter);
app.use('/api/v1/uploads',                uploadLimiter);
app.use(/\/conversations\/.*\/csat/,      csatLimiter);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',                                    authRouter);
app.use('/api/v1/orgs',                                    orgsRouter);
app.use('/api/v1/orgs/:orgId/workspaces',                  workspacesRouter);
// Rotas bloqueadas para tickets_only — o middleware verifica o role após workspaceContext
app.use('/api/v1/workspaces/:workspaceId/inboxes',         requireNotTicketsOnly, inboxesRouter);
app.use('/api/v1/workspaces/:workspaceId/contacts',        requireNotTicketsOnly, contactsRouter);
app.use('/api/v1/workspaces/:workspaceId/properties',      requireNotTicketsOnly, propertiesRouter);
app.use('/api/v1/workspaces/:workspaceId/comparisons',     requireNotTicketsOnly, comparisonsRouter);
app.use('/api/v1/workspaces/:workspaceId/partner-brokers', requireNotTicketsOnly, partnerBrokersRouter);
app.use('/api/v1/workspaces/:workspaceId/developments',    requireNotTicketsOnly, developmentsRouter);
// Feed XML público (token-based) — consumido pelo gtw-imoview, sem autenticação JWT
app.use('/api/v1/feeds',                                   propertiesFeedRouter);
// Comparativo de imóveis público (token-based) — link enviado ao cliente
app.use('/api/v1/comparisons',                             comparisonsPublicRouter);
app.use('/api/v1/proposals',                               proposalsPublicRouter);
app.use('/api/v1/portal',                                  portalPublicRouter);
app.use('/api/v1/workspaces/:workspaceId/visits',          requireNotTicketsOnly, visitsRouter);
app.use('/api/v1/workspaces/:workspaceId/conversations',   requireNotTicketsOnly, conversationsRouter);
app.use('/api/v1/workspaces/:workspaceId/kanban',          requireNotTicketsOnly, kanbanRouter);
app.use('/api/v1/workspaces/:workspaceId/tickets',         ticketsRouter);   // permitido
app.use('/api/v1/workspaces/:workspaceId/pipelines',       requireNotTicketsOnly, pipelinesRouter);
app.use('/api/v1/workspaces/:workspaceId/departments',     requireNotTicketsOnly, departmentsRouter);
app.use('/api/v1/workspaces/:workspaceId/canned',          requireNotTicketsOnly, cannedRouter);
app.use('/api/v1/workspaces/:workspaceId/labels',          requireNotTicketsOnly, labelsRouter);
app.use('/api/v1/workspaces/:workspaceId/reports',         requireNotTicketsOnly, reportsRouter);
app.use('/api/v1/workspaces/:workspaceId/templates',       requireNotTicketsOnly, templatesRouter);
app.use('/api/v1/workspaces/:workspaceId/permission-profiles', requireNotTicketsOnly, permissionsRouter);
app.use('/api/v1/uploads',                                 uploadsRouter);
app.use('/api/v1/integrations/google',                     googleCalendarRouter);
app.use('/api/v1/integrations/mail',                       mailIntegrationRouter);
app.use('/api/v1/push',                                    pushRouter);
app.use('/api/v1/conversations/:conversationId/messages',  messagesRouter);
app.use('/api/v1/webhooks',                                webhooksRouter);
app.use('/api/v1/workspaces/:workspaceId/meta',            metaRouter);
app.use('/api/v1/workspaces/:workspaceId/broadcasts',      requireNotTicketsOnly, broadcastsRouter);
app.use('/api/v1/workspaces/:workspaceId/notifications',   requireNotTicketsOnly, notificationsRouter);
app.use('/api/v1/workspaces/:workspaceId/nps',             requireNotTicketsOnly, npsRouter);
app.use('/api/v1/workspaces/:workspaceId/zapsign',         requireNotTicketsOnly, zapsignRouter);
app.use('/api/v1/zapsign',                                 zapsignRouter); // webhook público
app.use('/api/v1/workspaces/:workspaceId/imports',         requireNotTicketsOnly, importsRouter);
app.use('/api/v1/workspaces/:workspaceId/ai-agent',        requireNotTicketsOnly, aiAgentRouter);
app.use('/api/v1/workspaces/:workspaceId/parceiras',       requireNotTicketsOnly, partnerAgenciesRouter);
app.use('/api/v1/portal-parceiro',                         partnerPortalRouter);

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── Admin: logs em memória (superadmin only) ────────────────────────────────
const { authenticate: _authLogs } = require('./middleware/auth');
app.get('/api/v1/admin/logs', _authLogs, (req, res) => {
  if (!req.user?.isSuperAdmin) return res.status(403).json({ error: 'Acesso negado' });
  const limit = Math.min(Number(req.query.limit) || 200, 300);
  res.json(logger.getRecentLogs(limit).slice().reverse()); // mais recentes primeiro
});

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ───────────────────────────────────────────────────
const SENSITIVE_KEYS = /token|secret|password|api_key|apikey|authorization/i;
function sanitizeForLog(obj, depth = 0) {
  if (depth > 4 || typeof obj !== 'object' || !obj) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE_KEYS.test(k) ? [k, '[REDACTED]'] : [k, sanitizeForLog(v, depth + 1)]
    )
  );
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Multer file-size errors → 413 com mensagem amigável
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `Arquivo muito grande. O limite é ${Math.round((err.limit || 0) / 1024 / 1024)} MB.` });
  }
  logger.error(err.message, sanitizeForLog({ stack: err.stack, context: err.context }));
  const status = err.status || 500;
  // Expose the real message for all errors (stack is only in logs)
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── Socket.io — JWT obrigatório no handshake ───────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('AUTH_INVALID'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.user?.sub;
  logger.info('Socket connected', { id: socket.id, userId });

  // ── Handlers registrados SINCRONAMENTE antes de qualquer await ────────────

  // join:workspace — validado contra workspaces do usuário
  socket.on('join:workspace', async (workspaceId) => {
    try {
      const { query: dbQuery } = require('./config/database');
      const r = await dbQuery(
        `SELECT 1 FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM users WHERE id = $2 AND is_super_admin = true`,
        [workspaceId, userId]
      );
      if (r.rows.length) socket.join(`ws:${workspaceId}`);
    } catch { /* silently ignore */ }
  });

  // join:conversation — validado contra ownership
  socket.on('join:conversation', async (conversationId) => {
    try {
      const { query: dbQuery } = require('./config/database');
      const r = await dbQuery(
        `SELECT 1 FROM conversations c
         JOIN workspace_memberships wm ON wm.workspace_id = c.workspace_id
         WHERE c.id = $1 AND wm.user_id = $2
         UNION
         SELECT 1 FROM users WHERE id = $2 AND is_super_admin = true`,
        [conversationId, userId]
      );
      if (r.rows.length) socket.join(`conv:${conversationId}`);
    } catch { /* silently ignore */ }
  });

  socket.on('disconnect', () => logger.info('Socket disconnected', { id: socket.id, userId }));

  // ── Auto-join em background (não bloqueia o registro dos handlers) ────────
  // Garante que o socket já entre nas salas dos workspaces do usuário sem
  // depender do cliente emitir join:workspace (evita race condition).
  ;(async () => {
    try {
      const { query: dbQuery } = require('./config/database');
      const isSuperAdmin = socket.data.user?.isSuperAdmin;
      const r = isSuperAdmin
        ? await dbQuery('SELECT id AS workspace_id FROM workspaces')
        : await dbQuery(
            'SELECT workspace_id FROM workspace_memberships WHERE user_id = $1',
            [userId]
          );
      for (const row of r.rows) socket.join(`ws:${row.workspace_id}`);
    } catch { /* silently ignore */ }
  })();
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function start() {
  // Validate critical environment variables before starting
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    logger.error('FATAL: JWT_SECRET must be set and at least 32 characters long');
    process.exit(1);
  }
  if (!process.env.FRONTEND_URL && process.env.NODE_ENV === 'production') {
    logger.error('FATAL: FRONTEND_URL must be set in production');
    process.exit(1);
  }

  await initDatabase();
  await ensureBucket();
  await regenerateDomainsConfig();
  server.listen(PORT, () => {
    logger.info(`GTW Platform API on port ${PORT}`);
    logger.info('Integrations status', {
      smtp_configured:   !!(process.env.SMTP_HOST   && process.env.SMTP_USER),
      smtp_host:         process.env.SMTP_HOST        || '(não definido)',
      smtp_user:         process.env.SMTP_USER        || '(não definido)',
      smtp_pass_set:     !!process.env.SMTP_PASS,
      google_configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      google_client_id:  process.env.GOOGLE_CLIENT_ID  ? process.env.GOOGLE_CLIENT_ID.slice(0, 12) + '...' : '(não definido)',
      app_url:           process.env.APP_URL            || '(não definido)',
    });
    startJobs(io);
  });
}

start().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
