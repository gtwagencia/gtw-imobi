-- Integração Praedium (Central de Conexões): envio de leads qualificados +
-- recebimento de eventos de contato/atendimento. Configuração por workspace,
-- desabilitada por padrão.

CREATE TABLE IF NOT EXISTS praedium_integrations (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id             UUID        UNIQUE NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled                  BOOLEAN     NOT NULL DEFAULT false,
  client_code              TEXT,
  connection_slug          TEXT,
  access_token             TEXT,
  observation_field_slug   TEXT,
  qualified_lead_stage     TEXT        NOT NULL DEFAULT 'qualified_lead',
  inbound_enabled          BOOLEAN     NOT NULL DEFAULT false,
  inbound_token            TEXT        DEFAULT encode(gen_random_bytes(24), 'hex'),
  proactive_inbox_id       UUID        REFERENCES inboxes(id) ON DELETE SET NULL,
  proactive_template_name  TEXT,
  last_sent_at             TIMESTAMPTZ,
  last_send_result         JSONB,
  last_send_error          TEXT,
  last_received_at         TIMESTAMPTZ,
  last_receive_result      JSONB,
  last_receive_error       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_praedium_integrations_workspace
  ON praedium_integrations(workspace_id);

CREATE TRIGGER trg_praedium_integrations_updated
  BEFORE UPDATE ON praedium_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
