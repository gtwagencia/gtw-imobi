-- ================================================================
-- GTW Imobi — Migração 049: IA para geração de textos (independente do agente)
-- ================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS description_ai_provider TEXT DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS description_ai_model    TEXT DEFAULT '';
