-- ================================================================
-- GTW Imobi — Migração 045: Comissionamento automático de corretores parceiros
-- ================================================================

-- Percentual de comissão padrão do workspace (sobre o valor da venda/locação)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS default_commission_pct NUMERIC(5,2);

-- Override do percentual de comissão por empreendimento
ALTER TABLE developments
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2);

-- Corretores parceiros: profissionais/imobiliárias externas que trazem
-- compradores e recebem parte da comissão (split de corretagem)
CREATE TABLE IF NOT EXISTS partner_brokers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  agency_name  TEXT,
  creci        TEXT,
  phone        TEXT,
  email        TEXT,
  pix_key      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_brokers_workspace ON partner_brokers(workspace_id);

-- Comissão calculada automaticamente a cada venda/locação registrada
ALTER TABLE property_sales
  ADD COLUMN IF NOT EXISTS commission_pct           NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_value         NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS partner_broker_id        UUID REFERENCES partner_brokers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_commission_pct   NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS broker_commission_value  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS partner_commission_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS commission_status        TEXT NOT NULL DEFAULT 'pendente'; -- pendente | pago

CREATE INDEX IF NOT EXISTS idx_property_sales_partner_broker ON property_sales(partner_broker_id) WHERE partner_broker_id IS NOT NULL;
