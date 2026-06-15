-- ================================================================
-- GTW Imobi — Migração 041: Cofre de documentos com validade
-- ================================================================

CREATE TABLE IF NOT EXISTS property_documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'outro',
  file_url     TEXT NOT NULL,
  file_type    TEXT,
  expires_at   DATE,
  expiry_notified_at TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_documents_property ON property_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_expires  ON property_documents(expires_at) WHERE expires_at IS NOT NULL;
