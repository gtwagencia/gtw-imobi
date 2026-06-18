-- Adiciona suporte a Google Gemini como provedor de IA
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
