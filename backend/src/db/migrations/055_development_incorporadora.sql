-- ================================================================
-- GTW Imobi — Migração 055: Módulo Incorporadora
-- Adiciona: tipo de empreendimento, campos de unidade, zonas de preço,
--           info de parceiro em vendas e tabela de propostas
-- ================================================================

-- Tipo de empreendimento
ALTER TABLE developments
  ADD COLUMN IF NOT EXISTS development_type TEXT NOT NULL DEFAULT 'loteamento';
  -- loteamento | condominio_fechado | predio | comercial

ALTER TABLE developments
  ADD COLUMN IF NOT EXISTS total_units INTEGER;

-- Campos de unidade para incorporadora
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS area_front   NUMERIC(8,2),   -- testada/frente em metros
  ADD COLUMN IF NOT EXISTS area_depth   NUMERIC(8,2),   -- fundo em metros
  ADD COLUMN IF NOT EXISTS area_left    NUMERIC(8,2),   -- lateral esquerda em metros
  ADD COLUMN IF NOT EXISTS area_right   NUMERIC(8,2),   -- lateral direita em metros
  ADD COLUMN IF NOT EXISTS price_per_m2 NUMERIC(12,2),  -- R$/m² (calculado ou manual)
  ADD COLUMN IF NOT EXISTS price_zone   TEXT,           -- nome da zona de preço
  ADD COLUMN IF NOT EXISTS unit_floor   INTEGER,        -- andar (para prédio)
  ADD COLUMN IF NOT EXISTS unit_number  TEXT;           -- número do apartamento/sala

-- Zonas de preço por empreendimento
CREATE TABLE IF NOT EXISTS development_price_zones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id  UUID NOT NULL REFERENCES developments(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  modifier_type   TEXT NOT NULL DEFAULT 'per_m2',
  -- per_m2: valor por m² para esta zona
  -- fixed: preço fixo para unidades desta zona
  -- percent: % sobre o preço base (pode ser negativo, ex: -10 = desconto)
  modifier_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
  color           TEXT NOT NULL DEFAULT '#3b82f6',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ampliar property_sales com info de parceiro
ALTER TABLE property_sales
  ADD COLUMN IF NOT EXISTS partner_broker_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_broker_name TEXT,
  ADD COLUMN IF NOT EXISTS partner_agency_name TEXT,
  ADD COLUMN IF NOT EXISTS selling_broker_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_pct      NUMERIC(5,2);

-- Propostas de unidades (imobiliárias/corretores parceiros fazem proposta)
CREATE TABLE IF NOT EXISTS development_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  development_id  UUID NOT NULL REFERENCES developments(id) ON DELETE CASCADE,
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  proposed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  partner_agency  TEXT,
  partner_broker  TEXT,

  buyer_name      TEXT NOT NULL,
  buyer_cpf       TEXT,
  buyer_email     TEXT,
  buyer_phone     TEXT,

  proposed_price  NUMERIC(14,2) NOT NULL,
  payment_type    TEXT NOT NULL DEFAULT 'financiamento',
  -- vista | financiamento | parcelado_construtora | fgts
  down_payment    NUMERIC(14,2),
  installments    INTEGER,
  installment_value NUMERIC(14,2),
  financing_bank  TEXT,
  notes           TEXT,

  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | expired | converted
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',

  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_price_zones      ON development_price_zones(development_id);
CREATE INDEX IF NOT EXISTS idx_dev_proposals_dev    ON development_proposals(development_id, status);
CREATE INDEX IF NOT EXISTS idx_dev_proposals_ws     ON development_proposals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dev_proposals_prop   ON development_proposals(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_zone      ON properties(development_id, price_zone) WHERE development_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_dev_proposals_updated ON development_proposals;
CREATE TRIGGER trg_dev_proposals_updated
  BEFORE UPDATE ON development_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
