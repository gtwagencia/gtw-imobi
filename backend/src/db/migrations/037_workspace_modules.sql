-- ================================================================
-- GTW Imobi — Migração 037: Módulos configuráveis por workspace
-- ================================================================
-- Permite à agência escolher quais módulos ficam disponíveis para cada
-- cliente (workspace): CRM, Tickets, Imóveis, Empreendimentos, Mapa de
-- Vendas, Visitas, IA, Relatórios, Exportação para portais, Whitelabel
-- e Push. A lista de chaves válidas vive em
-- backend/src/config/workspaceModules.js.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] NOT NULL DEFAULT '{}';

-- Workspaces existentes: habilita todos os módulos para não remover nada
-- que já estava em uso (inclusive sales_map, já que construtoras antigas
-- também devem poder usar o mapa de quadras/lotes).
UPDATE workspaces
SET enabled_modules = ARRAY[
  'crm','tickets','properties','developments','sales_map',
  'visits','ai_agent','reports','portal_export','whitelabel','push'
]
WHERE enabled_modules = '{}';
