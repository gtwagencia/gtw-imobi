-- Fase 4 do roadmap imobiliário: configuração da IA "Lais" (persona por setor,
-- provider customizado/Ollama, toggle de ferramentas) + agendamento de visitas.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ai_base_url TEXT,
  ADD COLUMN IF NOT EXISTS custom_ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_tools_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS ai_persona TEXT;

CREATE TABLE IF NOT EXISTS property_visits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposta', -- proposta | confirmada | realizada | cancelada
  notes           TEXT,
  created_by_ai   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_visits_workspace ON property_visits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_property  ON property_visits(property_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_scheduled ON property_visits(workspace_id, scheduled_at);
