-- ================================================================
-- GTW Imobi — Migração 042: Avaliação automática de preço (CMA) via IA
-- ================================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS cma_price_min       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cma_price_max       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cma_suggested_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cma_analysis        TEXT,
  ADD COLUMN IF NOT EXISTS cma_generated_at    TIMESTAMPTZ;
