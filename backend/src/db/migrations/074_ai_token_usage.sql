-- Migração 074: Rastreamento de uso de tokens de IA por workspace (F9)

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ai_daily_token_limit INTEGER DEFAULT NULL;

COMMENT ON COLUMN workspaces.ai_daily_token_limit IS
  'Limite diário de tokens de IA estimados. NULL = sem limite.';

CREATE TABLE IF NOT EXISTS ai_token_usage (
  workspace_id  UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  usage_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_token_usage_date ON ai_token_usage(usage_date);
