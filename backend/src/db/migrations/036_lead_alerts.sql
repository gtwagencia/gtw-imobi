-- ================================================================
-- GTW Imobi — Migração 036: limiar configurável de "lead esquecido"
-- (alertas internos de SLA/lead já usam a tabela crm_notifications
-- criada na migração 034)
-- ================================================================

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS lead_stale_hours INTEGER NOT NULL DEFAULT 24;
