-- Audit log: adiciona entity_name para exibição legível na tela de atividade

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS entity_name TEXT;

-- Índice extra para facilitar filtros por ação e tipo de entidade
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
