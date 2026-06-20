-- Controle de redistribuição por SLA: guarda quando a conversa foi reatribuída ao próximo corretor
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sla_reassigned_at TIMESTAMPTZ;
