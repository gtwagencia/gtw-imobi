-- ================================================================
-- GTW Imobi — Migração 040: Comparador de imóveis (PDF/link)
-- ================================================================

CREATE TABLE IF NOT EXISTS property_comparisons (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  title        TEXT,
  property_ids UUID[] NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_comparisons_token     ON property_comparisons(token);
CREATE INDEX IF NOT EXISTS idx_property_comparisons_workspace ON property_comparisons(workspace_id);
