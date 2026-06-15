-- ================================================================
-- GTW Imobi — Migração 039: Lead scoring automático
-- ================================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lead_score INTEGER CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100));

CREATE INDEX IF NOT EXISTS idx_deals_lead_score
  ON deals(workspace_id, lead_score DESC)
  WHERE lead_score IS NOT NULL;
