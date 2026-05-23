-- ================================================================
-- Migration 024: API Oficial WhatsApp (WABA) + Broadcasts
-- ================================================================

-- Campos WABA na tabela inboxes
ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS waba_phone_number_id  TEXT,
  ADD COLUMN IF NOT EXISTS waba_access_token      TEXT,
  ADD COLUMN IF NOT EXISTS waba_business_id       TEXT;

-- ----------------------------------------------------------------
-- WABA TEMPLATES (templates de mensagem aprovados pelo Meta)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waba_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inbox_id        UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                        -- nome do template no Meta (snake_case)
  display_name    TEXT,                                 -- nome legível
  category        TEXT NOT NULL DEFAULT 'MARKETING',   -- MARKETING | UTILITY | AUTHENTICATION
  language        TEXT NOT NULL DEFAULT 'pt_BR',
  status          TEXT NOT NULL DEFAULT 'PENDING',      -- PENDING | APPROVED | REJECTED | PAUSED
  components      JSONB NOT NULL DEFAULT '[]',          -- estrutura dos componentes (header/body/footer/buttons)
  meta_template_id TEXT,                                -- ID retornado pelo Meta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inbox_id, name, language)
);

CREATE TRIGGER trg_waba_templates_updated
  BEFORE UPDATE ON waba_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- BROADCASTS (campanhas de envio em massa)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcasts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inbox_id        UUID NOT NULL REFERENCES inboxes(id),
  created_by      UUID NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  -- Conteúdo: ou template (WABA) ou mensagem livre (Evolution)
  message_type    TEXT NOT NULL DEFAULT 'text',         -- text | template | image | document
  content         TEXT,                                 -- texto livre (Evolution) ou corpo do template
  media_url       TEXT,
  template_id     UUID REFERENCES waba_templates(id),
  template_vars   JSONB DEFAULT '{}',                   -- variáveis do template {{1}}, {{2}} etc
  -- Agendamento
  scheduled_at    TIMESTAMPTZ,                          -- NULL = envio imediato
  -- Status geral
  status          TEXT NOT NULL DEFAULT 'draft',        -- draft | scheduled | running | paused | done | cancelled
  -- Métricas (cache)
  total_contacts  INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  -- Rate limiting: intervalo mínimo entre envios (ms)
  send_interval_ms INTEGER NOT NULL DEFAULT 1000,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_broadcasts_updated
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_broadcasts_workspace ON broadcasts(workspace_id, status, created_at DESC);

-- ----------------------------------------------------------------
-- BROADCAST CONTACTS (fila de envio individual)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id    UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone           TEXT NOT NULL,                        -- snapshot do telefone no momento do envio
  status          TEXT NOT NULL DEFAULT 'pending',      -- pending | sent | delivered | read | failed | skipped
  error_message   TEXT,
  message_id      UUID REFERENCES messages(id),         -- mensagem criada ao enviar
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(broadcast_id, contact_id)
);

CREATE INDEX idx_broadcast_contacts_broadcast ON broadcast_contacts(broadcast_id, status);
CREATE INDEX idx_broadcast_contacts_contact   ON broadcast_contacts(contact_id);
