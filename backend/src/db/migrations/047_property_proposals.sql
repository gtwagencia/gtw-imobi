-- ================================================================
-- GTW Imobi — Migração 047: Proposta/contrato em PDF (scaffold para e-signature)
-- ================================================================

CREATE TABLE IF NOT EXISTS property_proposals (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id        UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  token              TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  title              TEXT,
  buyer_name         TEXT NOT NULL,
  buyer_document     TEXT,
  buyer_email        TEXT,
  buyer_phone        TEXT,
  proposed_price     NUMERIC(14,2) NOT NULL,
  payment_conditions TEXT,
  validity_date      DATE,

  -- Cópia dos dados do imóvel/venda/marca no momento da geração, para manter
  -- o conteúdo da proposta estável mesmo se o cadastro mudar depois
  content            JSONB NOT NULL DEFAULT '{}'::jsonb,

  status             TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | enviada | assinada | cancelada

  -- Assinatura eletrônica simplificada (scaffold para integração futura)
  signature_name     TEXT,
  signature_document TEXT,
  signed_at          TIMESTAMPTZ,
  signed_ip          TEXT,

  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_proposals_token    ON property_proposals(token);
CREATE INDEX IF NOT EXISTS idx_property_proposals_property ON property_proposals(property_id);
CREATE INDEX IF NOT EXISTS idx_property_proposals_workspace ON property_proposals(workspace_id);
