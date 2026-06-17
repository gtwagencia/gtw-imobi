-- Histórico de importações de imóveis (CSV, URL, sistemas externos)
CREATE TABLE IF NOT EXISTS property_import_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'csv',
  source_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  total         INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace ON property_import_jobs(workspace_id, created_at DESC);
