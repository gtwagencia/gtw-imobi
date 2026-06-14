-- Fase 2 do roadmap imobiliário: classificação/documento de contatos e
-- corretor responsável pela carteira (independente de deals.assignee_id,
-- que é por negociação).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS contact_type      TEXT[] NOT NULL DEFAULT '{}', -- lead | cliente | proprietario | inquilino
  ADD COLUMN IF NOT EXISTS document_type     TEXT,                          -- cpf | cnpj
  ADD COLUMN IF NOT EXISTS document_number   TEXT,
  ADD COLUMN IF NOT EXISTS assigned_broker_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_type            ON contacts USING GIN (contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_broker ON contacts(assigned_broker_id) WHERE assigned_broker_id IS NOT NULL;

-- Perfil profissional do corretor/captador no workspace
ALTER TABLE workspace_memberships
  ADD COLUMN IF NOT EXISTS creci TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;
