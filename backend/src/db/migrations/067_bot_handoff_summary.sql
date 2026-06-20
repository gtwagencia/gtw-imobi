-- Resumo gerado pela IA no momento do handoff para o agente humano
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_handoff_summary TEXT;
