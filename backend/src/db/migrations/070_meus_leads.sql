-- ================================================================
-- Migration 070: Meus Leads — status do lead, tipo de cliente,
--                notas privadas por corretor e itens apresentados
-- ================================================================

-- Campos admin-only no contato (nunca expostos para corretores)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_status TEXT
    CHECK (lead_status IN ('em_prospeccao', 'em_atendimento', 'cliente_ativo')),
  ADD COLUMN IF NOT EXISTS client_type TEXT
    CHECK (client_type IN ('aluguel', 'venda')),
  ADD COLUMN IF NOT EXISTS client_development_id UUID
    REFERENCES developments(id) ON DELETE SET NULL;

-- Notas privadas por corretor por deal
-- Cada corretor só vê as próprias; admin vê todas.
-- Ao trocar o assignee, o novo corretor NÃO herda as notas anteriores.
CREATE TABLE IF NOT EXISTS deal_broker_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id    UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  broker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_deal_broker_notes_updated
  BEFORE UPDATE ON deal_broker_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_deal_broker_notes ON deal_broker_notes(deal_id, broker_id);

-- Imóveis/empreendimentos apresentados ao lead (histórico compartilhado entre corretores)
CREATE TABLE IF NOT EXISTS deal_offered_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id        UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  property_id    UUID REFERENCES properties(id) ON DELETE CASCADE,
  development_id UUID REFERENCES developments(id) ON DELETE CASCADE,
  offered_by     UUID NOT NULL REFERENCES users(id),
  notes          TEXT,
  offered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_offered_one CHECK (
    (property_id IS NOT NULL)::int + (development_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_deal_offered_items ON deal_offered_items(deal_id);
