-- ================================================================
-- GTW Imobi — Migração 038: Mapa de vendas (quadras/lotes) + importação
-- ================================================================
-- Suporta:
--  1. Loteamentos/condomínios fechados como developments com mapa de
--     quadras/lotes (planta-base + posição de cada lote no mapa).
--  2. Reserva temporária de lotes/unidades com expiração automática.
--  3. Fila de importação de loteamento via PDF/planilha (IA extrai os
--     lotes, usuário revisa antes de confirmar o cadastro em massa).

-- ----------------------------------------------------------------
-- DEVELOPMENTS: planta-base do mapa de quadras/lotes
-- ----------------------------------------------------------------
ALTER TABLE developments
  ADD COLUMN IF NOT EXISTS map_image_url TEXT; -- imagem da planta/mapa do loteamento

ALTER TABLE developments
  ADD COLUMN IF NOT EXISTS map_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  -- ex: { "width": 1200, "height": 800 } -- dimensões de referência da imagem,
  -- usadas para posicionar os lotes (map_shape) proporcionalmente

-- ----------------------------------------------------------------
-- PROPERTIES: identificação de quadra/lote, posição no mapa e reserva
-- ----------------------------------------------------------------
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS block_label TEXT; -- quadra (ex: "Quadra A")

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS lot_label TEXT; -- lote/unidade (ex: "Lote 12")

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS map_shape JSONB;
  -- posição/forma do lote no mapa do empreendimento, relativa a
  -- developments.map_config, ex: { "points": [[x1,y1],[x2,y2],...] }

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ; -- expiração da reserva

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS reserved_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_development_map
  ON properties(development_id, block_label, lot_label)
  WHERE development_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_reserved_until
  ON properties(reserved_until)
  WHERE reserved_until IS NOT NULL AND status = 'reservado';

-- ----------------------------------------------------------------
-- DEVELOPMENT_IMPORT_JOBS: importação de loteamento via PDF/planilha
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS development_import_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  development_id  UUID REFERENCES developments(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'processing', -- processing | review | done | error
  source_filename TEXT,
  extracted_lots  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- lotes extraídos pela IA, aguardando revisão
  error_message   TEXT,

  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_import_jobs_workspace   ON development_import_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dev_import_jobs_development ON development_import_jobs(development_id) WHERE development_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_dev_import_jobs_updated ON development_import_jobs;
CREATE TRIGGER trg_dev_import_jobs_updated BEFORE UPDATE ON development_import_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
