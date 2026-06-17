-- ================================================================
-- GTW Imobi — Migração 051: Assinatura eletrônica (ZapSign)
-- ================================================================

-- Configuração ZapSign no workspace
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS zapsign_api_token TEXT;

-- Status de assinatura em propostas/contratos
ALTER TABLE property_proposals
  ADD COLUMN IF NOT EXISTS zapsign_doc_token  TEXT,
  ADD COLUMN IF NOT EXISTS zapsign_sign_url   TEXT,
  ADD COLUMN IF NOT EXISTS signature_status   TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS signed_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_proposals_zapsign ON property_proposals(zapsign_doc_token) WHERE zapsign_doc_token IS NOT NULL;
