-- Add WhatsApp Business Account ID to workspaces
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;

-- ----------------------------------------------------------------
-- WHATSAPP TEMPLATE BATCHES
-- Cada batch é um conjunto de variações de um template submetidas
-- ao Meta para aprovação. Pelo menos uma precisa ser aprovada.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_template_batches (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  base_name      TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'MARKETING',
  language       TEXT NOT NULL DEFAULT 'pt_BR',
  header_type    TEXT,
  header_text    TEXT,
  footer_text    TEXT,
  buttons        JSONB NOT NULL DEFAULT '[]',
  base_body      TEXT NOT NULL,
  variant_count  INT  NOT NULL DEFAULT 5,
  status         TEXT NOT NULL DEFAULT 'generating',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- WHATSAPP TEMPLATE VARIANTS
-- Uma linha por variação gerada/submetida.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_template_variants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id          UUID NOT NULL REFERENCES whatsapp_template_batches(id) ON DELETE CASCADE,
  variant_index     INT  NOT NULL,
  name              TEXT NOT NULL,
  body              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  meta_template_id  TEXT,
  rejection_reason  TEXT,
  meta_response     JSONB,
  submitted_at      TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_batches_workspace ON whatsapp_template_batches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wa_variants_batch    ON whatsapp_template_variants(batch_id);
