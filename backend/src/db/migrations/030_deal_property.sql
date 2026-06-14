-- Fase 3 do roadmap imobiliário: vincula deals a um imóvel específico
-- (complementa contact_id, que já representa o lead/proprietário).

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_property ON deals(property_id) WHERE property_id IS NOT NULL;
