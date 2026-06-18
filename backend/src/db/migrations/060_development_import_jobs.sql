-- Histórico de importações de loteamentos via PDF (IA extrai quadras/lotes)
CREATE TABLE IF NOT EXISTS development_import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  development_id   UUID NOT NULL REFERENCES developments(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'review',   -- review | done | error
  source_filename  TEXT,
  extracted_lots   JSONB NOT NULL DEFAULT '[]',
  error_message    TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_import_jobs_dev ON development_import_jobs(development_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dev_import_jobs_ws  ON development_import_jobs(workspace_id, created_at DESC);
