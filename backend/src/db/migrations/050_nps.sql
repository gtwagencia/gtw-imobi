-- ================================================================
-- GTW Imobi — Migração 050: NPS pós-visita
-- ================================================================

CREATE TABLE IF NOT EXISTS nps_responses (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  visit_id     UUID        REFERENCES property_visits(id) ON DELETE SET NULL,
  contact_id   UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  score        INTEGER     CHECK (score BETWEEN 0 AND 10),
  comment      TEXT,
  sent_at      TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_workspace ON nps_responses(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_visit     ON nps_responses(visit_id) WHERE visit_id IS NOT NULL;

-- Flag na visita: NPS já enviado
ALTER TABLE property_visits
  ADD COLUMN IF NOT EXISTS nps_sent_at TIMESTAMPTZ;

-- Configuração de NPS no workspace
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS nps_enabled         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nps_delay_hours     INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS nps_inbox_id        UUID REFERENCES inboxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nps_message_template TEXT;
