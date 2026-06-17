-- Modelo de parceiras: imobiliária como entidade principal + usuários vinculados

CREATE TABLE IF NOT EXISTS partner_agencies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  cnpj         TEXT,
  creci        TEXT,   -- CRECI-J da imobiliária
  phone        TEXT,
  email        TEXT,
  city         TEXT,
  state        TEXT,
  address      TEXT,
  notes        TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_agencies_workspace ON partner_agencies(workspace_id);

CREATE TABLE IF NOT EXISTS partner_agency_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id    UUID NOT NULL REFERENCES partner_agencies(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'corretor',  -- corretor, auxiliar, gerente, diretor, etc.
  email        TEXT,
  phone        TEXT,
  creci        TEXT,   -- CRECI individual (opcional)
  portal_token TEXT UNIQUE,
  portal_active         BOOLEAN NOT NULL DEFAULT true,
  portal_developments   TEXT[]  DEFAULT '{}',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_agency_users_agency    ON partner_agency_users(agency_id);
CREATE INDEX IF NOT EXISTS idx_partner_agency_users_workspace ON partner_agency_users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_partner_agency_users_token     ON partner_agency_users(portal_token) WHERE portal_token IS NOT NULL;

-- Vincula propostas de empreendimentos à parceira e ao usuário específico
ALTER TABLE development_proposals
  ADD COLUMN IF NOT EXISTS partner_agency_id      UUID REFERENCES partner_agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_agency_user_id UUID REFERENCES partner_agency_users(id) ON DELETE SET NULL;
