-- ================================================================
-- Migration 025: Broadcast scheduling + retry
-- ================================================================

-- Retry e agendamento na tabela broadcasts
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS max_retries      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timezone         TEXT    NOT NULL DEFAULT 'America/Sao_Paulo';

-- Contador de tentativas por contato
ALTER TABLE broadcast_contacts
  ADD COLUMN IF NOT EXISTS retry_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_retry
  ON broadcast_contacts(broadcast_id, next_retry_at)
  WHERE status = 'failed';
