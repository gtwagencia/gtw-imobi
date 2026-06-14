'use strict';

// Módulos do menu cuja visibilidade pode ser configurada por perfil
// (workspace). Dashboard e Tickets ficam sempre visíveis para qualquer
// perfil e não entram aqui; Agentes/Organização/Configurações/Permissões
// continuam exclusivos de admin.
const PERMISSION_MODULES = [
  { key: 'conversations', label: 'Conversas' },
  { key: 'contacts',      label: 'Contatos' },
  { key: 'properties',    label: 'Imóveis' },
  { key: 'kanban',        label: 'Funil' },
  { key: 'broadcasts',    label: 'Broadcasts' },
  { key: 'inboxes',       label: 'Inboxes' },
  { key: 'departments',   label: 'Departamentos' },
  { key: 'canned',        label: 'Respostas Prontas' },
  { key: 'labels',        label: 'Etiquetas' },
  { key: 'reports',       label: 'Relatórios' },
];

// Perfis padrão criados para cada workspace (novo ou existente via migração).
// 'admin' e 'tickets_only' são travados (is_system) e não podem ser editados
// pela página de permissões.
const DEFAULT_PROFILES = [
  {
    slug: 'admin', name: 'Administrador', is_system: true,
    permissions: {
      conversations: true, contacts: true, properties: true, kanban: true,
      broadcasts: true, inboxes: true, departments: true, canned: true,
      labels: true, reports: true,
    },
  },
  {
    slug: 'tickets_only', name: 'Somente Tickets', is_system: true,
    permissions: {
      conversations: false, contacts: false, properties: false, kanban: false,
      broadcasts: false, inboxes: false, departments: false, canned: false,
      labels: false, reports: false,
    },
  },
  {
    slug: 'agent', name: 'Corretor', is_system: false,
    permissions: {
      conversations: true, contacts: true, properties: true, kanban: false,
      broadcasts: false, inboxes: false, departments: false, canned: false,
      labels: false, reports: false,
    },
  },
  {
    slug: 'member', name: 'Membro', is_system: false,
    permissions: {
      conversations: true, contacts: true, properties: true, kanban: false,
      broadcasts: false, inboxes: false, departments: false, canned: false,
      labels: false, reports: false,
    },
  },
  {
    slug: 'captador', name: 'Captador', is_system: false,
    permissions: {
      conversations: false, contacts: true, properties: true, kanban: false,
      broadcasts: false, inboxes: false, departments: false, canned: false,
      labels: false, reports: false,
    },
  },
  {
    slug: 'auxiliar_administrativo', name: 'Auxiliar Administrativo', is_system: false,
    permissions: {
      conversations: true, contacts: true, properties: true, kanban: true,
      broadcasts: true, inboxes: true, departments: true, canned: true,
      labels: true, reports: true,
    },
  },
];

const PERMISSION_MODULE_KEYS = PERMISSION_MODULES.map(m => m.key);

module.exports = { PERMISSION_MODULES, PERMISSION_MODULE_KEYS, DEFAULT_PROFILES };
