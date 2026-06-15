-- ================================================================
-- GTW Imobi — Migração 044: Cronograma de obra com fotos por etapa
-- ================================================================

CREATE TABLE IF NOT EXISTS development_construction_stages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  development_id UUID NOT NULL REFERENCES developments(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'pendente', -- pendente | em_andamento | concluida
  planned_date   DATE,
  completed_date DATE,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_construction_stages_development ON development_construction_stages(development_id);

CREATE TABLE IF NOT EXISTS construction_stage_photos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id   UUID NOT NULL REFERENCES development_construction_stages(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  caption    TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_construction_stage_photos_stage ON construction_stage_photos(stage_id);
