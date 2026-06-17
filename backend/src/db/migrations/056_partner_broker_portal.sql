-- Portal token para corretores parceiros acessarem o portal de propostas
ALTER TABLE partner_brokers
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_developments TEXT[] DEFAULT '{}'; -- IDs de empreendimentos com permissão

CREATE INDEX IF NOT EXISTS idx_partner_brokers_token ON partner_brokers(portal_token) WHERE portal_token IS NOT NULL;
