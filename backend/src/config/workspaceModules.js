'use strict';

// Módulos que a agência pode ligar/desligar por cliente (workspace).
// Controla o que aparece no menu/dashboard daquele cliente — diferente de
// permissionModules.js, que controla o que cada PERFIL DE USUÁRIO vê
// dentro de um módulo já habilitado.
const ALL_MODULES = [
  { key: 'crm',           label: 'CRM / Atendimento',        description: 'Conversas, contatos, funil, broadcasts, departamentos e etiquetas.' },
  { key: 'tickets',        label: 'Tickets',                  description: 'Quadro de tickets internos (suporte, financeiro, obras etc).' },
  { key: 'properties',     label: 'Imóveis',                  description: 'Catálogo de imóveis (próprios e/ou de terceiros).' },
  { key: 'developments',   label: 'Empreendimentos',          description: 'Lançamentos e condomínios, com unidades vinculadas.' },
  { key: 'sales_map',      label: 'Mapa de Vendas',           description: 'Mapa visual de quadras/lotes por empreendimento, com status de venda.' },
  { key: 'visits',         label: 'Visitas',                  description: 'Agenda de visitas e sincronização com Google Calendar.' },
  { key: 'ai_agent',       label: 'Agente de IA',             description: 'Assistente virtual de atendimento configurável (Lia).' },
  { key: 'reports',        label: 'Relatórios',               description: 'Dashboards de performance por corretor e origem.' },
  { key: 'portal_export',  label: 'Exportação para Portais',  description: 'Feed XML de imóveis para Zap/OLX/VivaReal.' },
  { key: 'whitelabel',     label: 'Domínio Personalizado',    description: 'Domínio próprio do cliente com certificado SSL automático.' },
  { key: 'push',           label: 'Notificações Push',        description: 'Avisos de novos leads via PWA instalável.' },
];

const ALL_MODULE_KEYS = ALL_MODULES.map(m => m.key);

// Pacote padrão sugerido ao cadastrar um novo cliente, conforme o modelo de
// negócio. Totalmente editável depois pela agência.
const MODULE_PRESETS = {
  imobiliaria: ['crm', 'tickets', 'properties', 'developments', 'visits', 'ai_agent', 'reports', 'portal_export', 'whitelabel', 'push'],
  construtora: ['crm', 'tickets', 'developments', 'sales_map', 'visits', 'ai_agent', 'reports', 'whitelabel', 'push'],
};

function presetFor(businessModel) {
  return MODULE_PRESETS[businessModel] || MODULE_PRESETS.imobiliaria;
}

module.exports = { ALL_MODULES, ALL_MODULE_KEYS, MODULE_PRESETS, presetFor };
