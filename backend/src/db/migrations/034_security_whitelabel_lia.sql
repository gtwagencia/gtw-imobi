-- ================================================================
-- GTW Imobi — Migração 034: Segurança avançada, IA "Lia" configurável,
-- white-label (domínio customizado) e notificações internas
-- ================================================================

-- ----------------------------------------------------------------
-- USERS: bloqueio de conta por tentativas falhas + 2FA (TOTP)
-- ----------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_secret       TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];

-- ----------------------------------------------------------------
-- AUDIT LOG — ações sensíveis (permissões, chaves de API, domínio, 2FA...)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL, -- ex: permission_profile.update, ai_key.update, custom_domain.set, 2fa.enable
  entity_type  TEXT,
  entity_id    TEXT,
  metadata     JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org       ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id);

-- ----------------------------------------------------------------
-- WORKSPACES: IA configurável (nome do agente) + white-label domínio custom
-- ----------------------------------------------------------------
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ai_agent_name TEXT NOT NULL DEFAULT 'Lia',
  ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS custom_domain_status TEXT NOT NULL DEFAULT 'none', -- none | pending | verified | error
  ADD COLUMN IF NOT EXISTS custom_domain_verification_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex');

UPDATE workspaces
  SET custom_domain_verification_token = encode(gen_random_bytes(16), 'hex')
  WHERE custom_domain_verification_token IS NULL;

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_custom_domain_status_check;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_custom_domain_status_check
  CHECK (custom_domain_status IN ('none', 'pending', 'verified', 'error'));

-- ----------------------------------------------------------------
-- NOTIFICAÇÕES INTERNAS — leads esquecidos, SLA vencido, etc.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL, -- sla_breached | lead_stale
  title           TEXT NOT NULL,
  message         TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_notifications_user ON crm_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_notifications_conv ON crm_notifications(conversation_id);

-- ----------------------------------------------------------------
-- PUSH NOTIFICATIONS (PWA)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ----------------------------------------------------------------
-- VISITAS ↔ GOOGLE CALENDAR
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS property_visit_google_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id   UUID NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(visit_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_property_visit_google_events_visit ON property_visit_google_events(visit_id);
CREATE INDEX IF NOT EXISTS idx_property_visit_google_events_user  ON property_visit_google_events(user_id);
