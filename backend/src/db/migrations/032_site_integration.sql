-- ================================================================
-- GTW Imobi — Migração 032: Integração com o site (gtw-imoview)
-- ================================================================
-- Token único por workspace usado para:
--  1. Autenticar o feed XML de imóveis (consumido pelo gtw-imoview)
--  2. Autenticar o webhook de leads enviados pelos formulários do site

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS site_integration_token TEXT DEFAULT encode(gen_random_bytes(24), 'hex');

UPDATE workspaces
  SET site_integration_token = encode(gen_random_bytes(24), 'hex')
  WHERE site_integration_token IS NULL;

-- ----------------------------------------------------------------
-- Origem dos leads recebidos via webhook do site
-- ----------------------------------------------------------------
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lead_message TEXT,
  ADD COLUMN IF NOT EXISTS lead_source  TEXT; -- ex: site_form | site_whatsapp
