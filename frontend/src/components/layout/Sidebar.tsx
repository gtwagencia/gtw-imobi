'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import clsx from 'clsx';
import {
  MessageSquare, Users, Kanban, Inbox, Settings,
  LogOut, ChevronDown, Building2, Home, User, Landmark,
  Check, Plus, ArrowLeftRight, LayoutList, BarChart2, BookMarked, Tag, Ticket, X, Send,
  ShieldCheck, ListChecks, Gauge, CalendarCheck, Construction, Handshake,
  Star, Upload, Bot, ScrollText,
} from 'lucide-react';
import { useSidebar } from '@/store/sidebar';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import type { Workspace, PermissionModuleKey } from '@/types';

// adminOnly: visível apenas para owners/admins de org ou workspace admins
// ticketsOnly: falso = oculto para perfil tickets_only
// Itens com entrada em NAV_PERMISSION_KEY são controlados pelo perfil de
// permissões do usuário (ver permission_profiles) em vez de adminOnly.
const ALL_NAV_ITEMS = [
  { href: '/dashboard',               icon: Home,          label: 'Início',            ticketsOnly: true,  adminOnly: false },
  { href: '/dashboard/conversations', icon: MessageSquare, label: 'Conversas',         ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/contacts',      icon: Users,         label: 'Contatos',          ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/imoveis',        icon: Building2,     label: 'Imóveis',           ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/empreendimentos', icon: Construction, label: 'Empreendimentos',  ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/parceiras',      icon: Handshake,    label: 'Parceiras',          ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/visitas',        icon: CalendarCheck,label: 'Visitas',            ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/transmissoes',   icon: Send,         label: 'Transmissões',       ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/funil',          icon: Kanban,       label: 'Funil',              ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/meus-leads',     icon: ListChecks,   label: 'Meus Leads',         ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/leads',          icon: Users,        label: 'Leads Qualificados', ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/tickets',        icon: Ticket,       label: 'Tickets',            ticketsOnly: true,  adminOnly: false },
  { href: '/dashboard/caixas-entrada', icon: Inbox,        label: 'Caixas de Entrada',  ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/agentes',        icon: Users,        label: 'Agentes',            ticketsOnly: false, adminOnly: true  },
  { href: '/dashboard/departamentos',  icon: LayoutList,   label: 'Departamentos',      ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/setores',        icon: Gauge,        label: 'Setores',            ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/respostas-prontas', icon: BookMarked,label: 'Respostas Prontas',  ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/etiquetas',      icon: Tag,          label: 'Etiquetas',          ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/agente-ia',      icon: Bot,          label: 'Agente IA',          ticketsOnly: false, adminOnly: true  },
  { href: '/dashboard/relatorios',     icon: BarChart2,    label: 'Relatórios',         ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/nps',            icon: Star,         label: 'NPS Pós-Visita',     ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/importacoes',    icon: Upload,       label: 'Importações',        ticketsOnly: false, adminOnly: false },
];

// Mapa item da sidebar -> módulo habilitável por workspace em /dashboard/settings.
// Itens sem entrada aqui são considerados sempre disponíveis (núcleo da plataforma).
const NAV_MODULE_KEY: Record<string, string> = {
  '/dashboard/conversations':    'crm',
  '/dashboard/contacts':         'crm',
  '/dashboard/imoveis':          'properties',
  '/dashboard/empreendimentos':  'developments',
  '/dashboard/parceiras':        'developments',
  '/dashboard/visitas':          'visits',
  '/dashboard/transmissoes':     'crm',
  '/dashboard/funil':            'crm',
  '/dashboard/meus-leads':       'crm',
  '/dashboard/leads':            'crm',
  '/dashboard/tickets':          'tickets',
  '/dashboard/caixas-entrada':   'crm',
  '/dashboard/departamentos':    'crm',
  '/dashboard/setores':          'crm',
  '/dashboard/respostas-prontas':'crm',
  '/dashboard/etiquetas':        'crm',
  '/dashboard/relatorios':       'reports',
  '/dashboard/nps':              'properties',
  '/dashboard/importacoes':      'properties',
};

// Mapa item da sidebar -> módulo configurável em /dashboard/permissions
const NAV_PERMISSION_KEY: Record<string, PermissionModuleKey> = {
  '/dashboard/conversations': 'conversations',
  '/dashboard/contacts':      'contacts',
  '/dashboard/imoveis':         'properties',
  '/dashboard/empreendimentos': 'properties',
  '/dashboard/parceiras':         'properties',
  '/dashboard/visitas':           'properties',
  '/dashboard/transmissoes':      'broadcasts',
  '/dashboard/funil':             'kanban',
  '/dashboard/meus-leads':        'kanban',
  '/dashboard/leads':             'contacts',
  '/dashboard/caixas-entrada':    'inboxes',
  '/dashboard/departamentos':     'departments',
  '/dashboard/setores':           'departments',
  '/dashboard/respostas-prontas': 'canned',
  '/dashboard/etiquetas':         'labels',
  '/dashboard/relatorios':        'reports',
  '/dashboard/nps':               'properties',
  '/dashboard/importacoes':       'properties',
};

const bottomItems = [
  { href: '/dashboard/org',         icon: Landmark,    label: 'Organização',   ticketsOnly: false, adminOnly: true,  platformAdminOnly: true  },
  { href: '/dashboard/permissions', icon: ShieldCheck, label: 'Permissões',    ticketsOnly: false, adminOnly: true,  platformAdminOnly: true  },
  { href: '/dashboard/settings',    icon: Settings,    label: 'Configurações', ticketsOnly: false, adminOnly: true,  platformAdminOnly: true  },
  { href: '/dashboard/profile',     icon: User,        label: 'Perfil',        ticketsOnly: true,  adminOnly: false, platformAdminOnly: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, currentOrg, currentWorkspace, setWorkspace } = useAuth();
  const { workspaces, fetchForOrg } = useWorkspaceStore();
  const { isOpen, close } = useSidebar();

  const [wsOpen, setWsOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [permissions, setPermissions] = useState<Record<PermissionModuleKey, boolean> | null>(null);

  // isPlatformAdmin: super_admin, org owner ou org admin (agência/plataforma)
  // NÃO inclui workspace admin (o cliente) — para itens sensíveis como Configurações
  const isPlatformAdmin = user?.is_super_admin
    || currentOrg?.role === 'owner'
    || currentOrg?.role === 'admin';

  // isAdmin: inclui também workspace admin e org owners sem role definida
  const isAdmin = isPlatformAdmin
    || currentWorkspace?.role === 'admin'
    || currentWorkspace?.role === undefined; // org owners não têm role na membership

  useEffect(() => {
    if (currentOrg) fetchForOrg(currentOrg.id);
  }, [currentOrg, fetchForOrg]);

  // Busca o perfil de permissões efetivo do usuário neste workspace, usado
  // para decidir quais módulos aparecem no menu para perfis não-admin.
  useEffect(() => {
    if (!currentWorkspace || isAdmin || currentWorkspace.role === 'tickets_only') {
      setPermissions(null);
      return;
    }
    let cancelled = false;
    api.get(`/workspaces/${currentWorkspace.id}/permission-profiles/me`)
      .then(({ data }) => { if (!cancelled) setPermissions(data.permissions); })
      .catch(() => { if (!cancelled) setPermissions(null); });
    return () => { cancelled = true; };
  }, [currentWorkspace, isAdmin]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setWsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleWorkspaceSwitch(ws: Workspace) {
    setWorkspace(ws);
    setWsOpen(false);
    close();
    router.push('/dashboard');
  }

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  }

  // Decide se um item do menu aparece para o usuário atual.
  // platformAdminOnly: exige isPlatformAdmin (super_admin / org owner / org admin).
  // adminOnly: exige isAdmin (inclui workspace admin).
  // Itens mapeados em NAV_PERMISSION_KEY seguem o perfil de permissões.
  function canShow(item: { href: string; adminOnly: boolean; platformAdminOnly?: boolean }) {
    if (item.platformAdminOnly) return isPlatformAdmin;
    // Quando restrict_conversations está ativo, apenas admins veem a aba de conversas
    if (item.href === '/dashboard/conversations' && currentWorkspace?.restrict_conversations && !isAdmin) return false;
    if (isAdmin) return true;
    const permKey = NAV_PERMISSION_KEY[item.href];
    if (permKey) return !!permissions?.[permKey];
    return !item.adminOnly;
  }

  // Módulo desativado pela agência para este workspace: some do menu para
  // todos os usuários, independente do perfil/permissões.
  function moduleEnabled(item: { href: string }) {
    const modKey = NAV_MODULE_KEY[item.href];
    if (!modKey) return true;
    const enabled = currentWorkspace?.enabled_modules;
    if (!enabled) return true; // ainda não carregado: não esconde
    return enabled.includes(modKey);
  }

  return (
    <>
      {/* Overlay mobile — só aparece quando o drawer está aberto */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar
          Desktop (md+): position static, no fluxo, sempre visível
          Mobile: position fixed, fora do fluxo, desliza com translate */}
      <aside className={clsx(
        'flex flex-col flex-shrink-0 h-screen bg-ink-950 transition-transform duration-300',
        // Desktop: no fluxo, tamanho fixo
        'md:static md:w-64 md:translate-x-0',
        // Mobile: fixed, desliza para dentro/fora
        'fixed inset-y-0 left-0 w-72 z-50',
        // Visibilidade mobile via translate (desktop sempre translate-x-0 acima)
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
      {/* Logo + botão fechar no mobile */}
      <div className="px-5 py-4 border-b border-ink-800">
        <div className="flex items-center gap-3">
          <img src="/logo-preta-azul.png" alt="Imobi360" className="h-8 w-auto flex-1 min-w-0" />
          <button onClick={close} className="md:hidden text-gray-500 hover:text-white p-1 rounded flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 py-2 border-b border-ink-800" ref={dropRef}>
        <button
          onClick={() => setWsOpen(!wsOpen)}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left
                     text-gray-300 hover:bg-ink-800 transition-colors"
        >
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center
                          text-white text-xs font-bold flex-shrink-0">
            {currentWorkspace?.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate leading-tight">
              {currentWorkspace?.name}
            </div>
            <div className="text-xs text-gray-500 truncate leading-tight mt-0.5">
              {currentOrg?.name}
            </div>
          </div>
          <ChevronDown className={clsx('w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0', wsOpen && 'rotate-180')} />
        </button>

        {wsOpen && (
          <div className="mt-1 rounded-xl bg-ink-800 border border-ink-700 shadow-xl overflow-hidden">
            <div className="p-1.5">
              <p className="text-xs text-gray-500 px-2 py-1 font-medium uppercase tracking-wider">
                {currentOrg?.name}
              </p>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleWorkspaceSwitch(ws)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left
                             text-gray-300 hover:bg-ink-700 hover:text-white transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-ink-700 flex items-center justify-center
                                  text-white text-xs font-bold flex-shrink-0">
                    {ws.name[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm truncate">{ws.name}</span>
                  {ws.id === currentWorkspace?.id && (
                    <Check className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-ink-700 p-1.5">
              {(currentOrg?.role === 'owner' || currentOrg?.role === 'admin') && (
                <Link
                  href="/dashboard/org?tab=workspaces"
                  onClick={() => setWsOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm
                             text-gray-400 hover:bg-ink-700 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Novo workspace
                </Link>
              )}
              <button
                onClick={() => { setWsOpen(false); router.push('/select'); }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm
                           text-gray-400 hover:bg-ink-700 hover:text-white transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Trocar organização
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {ALL_NAV_ITEMS
          .filter(item => currentWorkspace?.role !== 'tickets_only' || item.ticketsOnly)
          .filter(moduleEnabled)
          .filter(canShow)
          .map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              isActive(href)
                ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-glow'
                : 'text-gray-400 hover:bg-ink-800 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-2 space-y-0.5 border-t border-ink-800 pt-2">
        {bottomItems
          .filter(item => currentWorkspace?.role !== 'tickets_only' || item.ticketsOnly)
          .filter(canShow)
          .map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-ink-800 text-white'
                : 'text-gray-500 hover:bg-ink-800 hover:text-gray-300'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
        {/* Logs — admins de plataforma (superadmin, org owner/admin) */}
        {isPlatformAdmin && (
          <Link
            href="/dashboard/logs"
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive('/dashboard/logs')
                ? 'bg-ink-800 text-white'
                : 'text-gray-500 hover:bg-ink-800 hover:text-gray-300'
            )}
          >
            <ScrollText className="w-4 h-4 flex-shrink-0" />
            Logs
          </Link>
        )}
      </div>

      {/* User */}
      <div className="px-3 py-3 border-t border-ink-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center
                          text-white text-sm font-semibold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.name}</div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => useAuth.getState().logout()}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
