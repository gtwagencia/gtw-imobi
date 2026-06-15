-- ================================================================
-- GTW Imobi — Migração 046: Gestão de permuta (imóveis recebidos como parte do pagamento)
-- ================================================================

CREATE TABLE IF NOT EXISTS property_exchanges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sale_id         UUID NOT NULL REFERENCES property_sales(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  property_type   TEXT,
  address         TEXT,
  appraised_value NUMERIC(14,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente', -- pendente | aceita | recebida | revendida
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_exchanges_sale ON property_exchanges(sale_id);
