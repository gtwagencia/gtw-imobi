-- 071_contact_attempts.sql
-- Modo de leads: configuração por workspace + log de tentativas de contato

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS restrict_conversations BOOLEAN NOT NULL DEFAULT false;

-- Registra cada vez que um corretor clica em Ligar / WhatsApp / E-mail no modal de lead
CREATE TABLE IF NOT EXISTS contact_attempts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id    UUID        NOT NULL REFERENCES contacts(id)   ON DELETE CASCADE,
  deal_id       UUID        REFERENCES deals(id) ON DELETE SET NULL,
  broker_id     UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  channel       VARCHAR(20) NOT NULL CHECK (channel IN ('call', 'whatsapp', 'email')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_attempts_contact  ON contact_attempts (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_attempts_workspace ON contact_attempts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_attempts_broker   ON contact_attempts (broker_id);
