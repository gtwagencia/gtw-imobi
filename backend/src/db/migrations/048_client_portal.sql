-- ================================================================
-- GTW Imobi — Migração 048: Portal do cliente (área logada do comprador)
-- ================================================================

-- Token de acesso ao portal do comprador (gerado sob demanda pelo corretor)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_contacts_portal_token ON contacts(portal_token) WHERE portal_token IS NOT NULL;

-- Controla quais documentos do cofre ficam visíveis no portal do cliente
ALTER TABLE property_documents
  ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT false;
