-- sla_effective_start_at: quando o timer do SLA efetivamente começou a contar
-- (= primeiro momento dentro do horário de atendimento configurado após a criação da conversa)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_effective_start_at TIMESTAMPTZ;

-- assignee_assigned_at: quando o corretor/agente atual foi atribuído
-- (usado para escopo de mensagens visíveis por período de atribuição)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assignee_assigned_at TIMESTAMPTZ;
