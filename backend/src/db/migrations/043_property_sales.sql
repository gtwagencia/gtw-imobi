-- ================================================================
-- GTW Imobi — Migração 043: Tabela de vendas/condições de pagamento por unidade
-- ================================================================

CREATE TABLE IF NOT EXISTS property_sales (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id        UUID NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  buyer_id           UUID REFERENCES contacts(id) ON DELETE SET NULL,
  sale_price         NUMERIC(14,2) NOT NULL,
  down_payment       NUMERIC(14,2), -- entrada
  installments_count INTEGER,       -- número de parcelas mensais
  installment_value  NUMERIC(14,2), -- valor de cada parcela mensal
  financing_value    NUMERIC(14,2), -- valor financiado junto a instituição
  sale_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  notes              TEXT,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_sales_workspace ON property_sales(workspace_id);
