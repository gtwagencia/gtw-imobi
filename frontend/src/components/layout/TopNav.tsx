'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import { useNotifications } from '@/store/notifications';
import { useAlerts } from '@/store/alerts';
import { useCrmAlerts } from '@/store/crmAlerts';
import { useSidebar } from '@/store/sidebar';
import clsx from 'clsx';
import {
  MessageSquare, Users, Kanban, Inbox, Settings, LogOut, ChevronDown,
  Building2, Landmark, Check, Plus, ArrowLeftRight, LayoutList,
  BookMarked, Tag, Ticket, Send, ShieldCheck, ListChecks,
  CalendarCheck, Construction, Handshake, Menu, X, User, Bell, AtSign,
  AlertTriangle, Clock, UserCheck, MessageCircle, BarChart2,
  Star, Upload, Bot,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import type { Workspace, PermissionModuleKey } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Module / permission maps ───────────────────────────────────────────────

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
  '/dashboard/tickets':          'tickets',
  '/dashboard/caixas-entrada':   'crm',
  '/dashboard/departamentos':    'crm',
  '/dashboard/respostas-prontas':'crm',
  '/dashboard/etiquetas':        'crm',
  '/dashboard/relatorios':       'reports',
  '/dashboard/nps':              'properties',
  '/dashboard/importacoes':      'properties',
};

const NAV_PERMISSION_KEY: Record<string, PermissionModuleKey> = {
  '/dashboard/conversations':    'conversations',
  '/dashboard/contacts':         'contacts',
  '/dashboard/imoveis':          'properties',
  '/dashboard/empreendimentos':  'properties',
  '/dashboard/parceiras':        'properties',
  '/dashboard/visitas':          'properties',
  '/dashboard/transmissoes':     'broadcasts',
  '/dashboard/funil':            'kanban',
  '/dashboard/meus-leads':       'kanban',
  '/dashboard/caixas-entrada':   'inboxes',
  '/dashboard/departamentos':    'departments',
  '/dashboard/respostas-prontas':'canned',
  '/dashboard/etiquetas':        'labels',
  '/dashboard/relatorios':       'reports',
  '/dashboard/nps':              'properties',
  '/dashboard/importacoes':      'properties',
};

// ─── Notification configs ───────────────────────────────────────────────────

const NOTIF_CFG = {
  new_conversation: { icon: MessageSquare, color: 'text-green-500',  bg: 'bg-green-50',  label: 'Conversa'   },
  new_message:      { icon: MessageSquare, color: 'text-brand-500',  bg: 'bg-brand-50',  label: 'Mensagem'   },
  ticket_assigned:  { icon: UserCheck,     color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Ticket'     },
  ticket_comment:   { icon: MessageCircle, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Comentário' },
  ticket_updated:   { icon: Ticket,        color: 'text-orange-500', bg: 'bg-orange-50', label: 'Ticket'     },
} as const;

const CRM_NOTIF_CFG = {
  sla_breached: { icon: AlertTriangle, color: 'text-red-500',   bg: 'bg-red-50'   },
  lead_stale:   { icon: Clock,         color: 'text-amber-500', bg: 'bg-amber-50' },
} as const;

// ─── Nav item types ─────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ticketsOnly: boolean;
  adminOnly: boolean;
  platformAdminOnly?: boolean;
}

const CRM_ITEMS: NavItem[] = [
  { href: '/dashboard/conversations',  label: 'Conversas',        icon: MessageSquare, ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/contacts',       label: 'Contatos',         icon: Users,         ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/transmissoes',   label: 'Transmissões',     icon: Send,          ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/funil',          label: 'Funil',            icon: Kanban,        ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/meus-leads',     label: 'Meus Leads',       icon: ListChecks,    ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/caixas-entrada', label: 'Caixas de Entrada',icon: Inbox,         ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/departamentos',  label: 'Departamentos',    icon: LayoutList,    ticketsOnly: false, adminOnly: false },
];

const ATIVOS_ITEMS: NavItem[] = [
  { href: '/dashboard/imoveis',         label: 'Imóveis',          icon: Building2,     ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/empreendimentos', label: 'Empreendimentos',  icon: Construction,  ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/parceiras',       label: 'Parceiras',        icon: Handshake,     ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/visitas',         label: 'Visitas',          icon: CalendarCheck, ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/nps',             label: 'NPS Pós-Visita',   icon: Star,          ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/importacoes',     label: 'Importações',      icon: Upload,        ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/agente-ia',       label: 'Agente IA',        icon: Bot,           ticketsOnly: false, adminOnly: true  },
];

const TICKETS_ITEMS: NavItem[] = [
  { href: '/dashboard/tickets',          label: 'Tickets',           icon: Ticket,     ticketsOnly: true,  adminOnly: false },
  { href: '/dashboard/respostas-prontas',label: 'Respostas Prontas', icon: BookMarked, ticketsOnly: false, adminOnly: false },
  { href: '/dashboard/etiquetas',        label: 'Etiquetas',         icon: Tag,        ticketsOnly: false, adminOnly: false },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/dashboard/members',     label: 'Agentes',       icon: Users,       ticketsOnly: false, adminOnly: true,  platformAdminOnly: false },
  { href: '/dashboard/org',         label: 'Organização',   icon: Landmark,    ticketsOnly: false, adminOnly: true,  platformAdminOnly: true  },
  { href: '/dashboard/permissions', label: 'Permissões',    icon: ShieldCheck, ticketsOnly: false, adminOnly: true,  platformAdminOnly: true  },
  { href: '/dashboard/settings',    label: 'Configurações', icon: Settings,    ticketsOnly: false, adminOnly: true,  platformAdminOnly: true  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function TopNav() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, currentOrg, currentWorkspace, setWorkspace } = useAuth();
  const { workspaces, fetchForOrg } = useWorkspaceStore();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const { alerts, unreadCount: alertCount, markRead: markAlertRead, markAllRead: markAllAlerts } = useAlerts();
  const { alerts: crmAlerts, unreadCount: crmAlertCount, markRead: markCrmRead, markAllRead: markAllCrmAlerts } = useCrmAlerts();
  const { isOpen: mobileOpen, toggle: toggleMobile, close: closeMobile } = useSidebar();

  const [wsOpen,        setWsOpen]       = useState(false);
  const [userOpen,      setUserOpen]     = useState(false);
  const [activeDropdown, setDrop]        = useState<string | null>(null);
  const [openBell,      setOpenBell]     = useState<'alerts' | 'crm' | 'notif' | null>(null);
  const [permissions,   setPermissions]  = useState<Record<PermissionModuleKey, boolean> | null>(null);

  const navRef = useRef<HTMLElement>(null);

  const isPlatformAdmin = !!(
    user?.is_super_admin
    || currentOrg?.role === 'owner'
    || currentOrg?.role === 'admin'
  );

  const isAdmin = isPlatformAdmin || !!(
    currentWorkspace?.role === 'admin'
    || currentWorkspace?.role === undefined
  );

  useEffect(() => {
    if (currentOrg) fetchForOrg(currentOrg.id);
  }, [currentOrg, fetchForOrg]);

  useEffect(() => {
    if (!currentWorkspace || isAdmin || currentWorkspace.role === 'tickets_only') {
      setPermissions(null); return;
    }
    let cancelled = false;
    api.get(`/workspaces/${currentWorkspace.id}/permission-profiles/me`)
      .then(({ data }) => { if (!cancelled) setPermissions(data.permissions); })
      .catch(() => { if (!cancelled) setPermissions(null); });
    return () => { cancelled = true; };
  }, [currentWorkspace, isAdmin]);

  // Close all dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setDrop(null); setWsOpen(false); setUserOpen(false); setOpenBell(null);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function canShow(item: { href: string; adminOnly: boolean; platformAdminOnly?: boolean }) {
    if (item.platformAdminOnly) return isPlatformAdmin;
    if (isAdmin) return true;
    const permKey = NAV_PERMISSION_KEY[item.href];
    if (permKey) return !!permissions?.[permKey];
    return !item.adminOnly;
  }

  function moduleEnabled(item: { href: string }) {
    const modKey = NAV_MODULE_KEY[item.href];
    if (!modKey) return true;
    const enabled = currentWorkspace?.enabled_modules;
    if (!enabled) return true;
    return enabled.includes(modKey);
  }

  function filterItems(items: NavItem[]) {
    return items
      .filter(i => currentWorkspace?.role !== 'tickets_only' || i.ticketsOnly)
      .filter(i => moduleEnabled(i))
      .filter(i => canShow(i));
  }

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  }

  function groupActive(items: NavItem[]) {
    return filterItems(items).some(i => isActive(i.href));
  }

  function handleWorkspaceSwitch(ws: Workspace) {
    setWorkspace(ws); setWsOpen(false); closeMobile(); router.push('/dashboard');
  }

  function closeAll() {
    setDrop(null); setWsOpen(false); setUserOpen(false); setOpenBell(null); closeMobile();
  }

  // ── Sub-components ─────────────────────────────────────────────────────

  function NavDropdown({ groupKey, label, items }: { groupKey: string; label: string; items: NavItem[] }) {
    const filtered = filterItems(items);
    if (filtered.length === 0) return null;
    const active = groupActive(items);
    const open   = activeDropdown === groupKey;
    return (
      <div className="relative">
        <button
          onClick={() => setDrop(open ? null : groupKey)}
          className={clsx(
            'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all',
            active
              ? 'text-brand-600 bg-brand-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
          )}
        >
          {label}
          <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1.5 w-52 bg-white rounded-xl shadow-nav border border-gray-100 py-1.5 z-50">
            {filtered.map(({ href, label: lbl, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={closeAll}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors mx-1.5 rounded-lg',
                  isActive(href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {lbl}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  function BellPanel({ type, count, title, onClear, children }: {
    type: 'alerts' | 'crm' | 'notif';
    count: number;
    title: string;
    onClear?: () => void;
    children: React.ReactNode;
  }) {
    const icons = { alerts: AtSign, crm: AlertTriangle, notif: Bell };
    const colors = { alerts: 'bg-indigo-600', crm: 'bg-red-500', notif: 'bg-red-500' };
    const Icon = icons[type];
    return (
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setOpenBell(openBell === type ? null : type)}
          className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Icon className="w-5 h-5" />
          {count > 0 && (
            <span className={clsx(
              'absolute top-1 right-1 w-4 h-4 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none',
              colors[type],
            )}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
        {openBell === type && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-nav border border-gray-100 overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-900 text-sm">{title}</span>
              {count > 0 && onClear && (
                <button onClick={onClear} className="text-xs text-brand-600 hover:underline">
                  Limpar todos
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">{children}</div>
          </div>
        )}
      </div>
    );
  }

  // ── Mobile drawer ─────────────────────────────────────────────────────

  const allMobileGroups = [
    { label: 'CRM',     items: CRM_ITEMS     },
    { label: 'Ativos',  items: ATIVOS_ITEMS },
    { label: 'Tickets', items: TICKETS_ITEMS },
  ];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <nav ref={navRef} className="h-14 bg-white border-b border-gray-100 shadow-soft flex items-center px-4 gap-2 z-40 flex-shrink-0">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 mr-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[17px] text-gray-900 tracking-tight hidden sm:block">
            Imobi<span className="text-brand-600">360</span>
          </span>
        </Link>

        {/* Workspace switcher — compact */}
        <div className="relative hidden md:block flex-shrink-0">
          <button
            onClick={() => setWsOpen(!wsOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors max-w-[160px]"
          >
            <div className="w-4 h-4 rounded bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
              {currentWorkspace?.name[0]?.toUpperCase()}
            </div>
            <span className="truncate">{currentWorkspace?.name}</span>
            <ChevronDown className={clsx('w-3 h-3 text-gray-400 flex-shrink-0 transition-transform', wsOpen && 'rotate-180')} />
          </button>
          {wsOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl shadow-nav border border-gray-100 overflow-hidden z-50">
              <div className="p-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">
                  {currentOrg?.name}
                </p>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleWorkspaceSwitch(ws)}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-gray-600 text-[9px] font-bold flex-shrink-0">
                      {ws.name[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 truncate">{ws.name}</span>
                    {ws.id === currentWorkspace?.id && <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 p-1.5">
                {(currentOrg?.role === 'owner' || currentOrg?.role === 'admin') && (
                  <Link
                    href="/dashboard/org?tab=workspaces"
                    onClick={() => setWsOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo workspace
                  </Link>
                )}
                <button
                  onClick={() => { setWsOpen(false); router.push('/select'); }}
                  className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" /> Trocar organização
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1 hidden md:block flex-shrink-0" />

        {/* Main nav — desktop */}
        <div className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
          {/* Início */}
          {(currentWorkspace?.role !== 'tickets_only' || true) && (
            <Link
              href="/dashboard"
              className={clsx(
                'px-3 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0',
                isActive('/dashboard') && pathname === '/dashboard'
                  ? 'text-brand-600 bg-brand-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
              )}
            >
              Início
            </Link>
          )}

          <NavDropdown groupKey="crm"     label="CRM"       items={CRM_ITEMS}     />
          <NavDropdown groupKey="ativos"   label="Ativos"    items={ATIVOS_ITEMS} />
          {(!currentWorkspace?.enabled_modules || currentWorkspace.enabled_modules.includes('tickets'))
            ? <NavDropdown groupKey="tickets" label="Tickets" items={TICKETS_ITEMS} />
            : null
          }

          {/* Relatórios */}
          {(isAdmin || permissions?.reports) && (
            (() => {
              const modEnabled = !NAV_MODULE_KEY['/dashboard/relatorios']
                || !currentWorkspace?.enabled_modules
                || currentWorkspace.enabled_modules.includes('reports');
              return modEnabled ? (
                <Link
                  href="/dashboard/relatorios"
                  className={clsx(
                    'px-3 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0',
                    isActive('/dashboard/relatorios')
                      ? 'text-brand-600 bg-brand-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                  )}
                >
                  Relatórios
                </Link>
              ) : null;
            })()
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Admin dropdown */}
          {isAdmin && (
            <div className="relative hidden md:block flex-shrink-0">
              <button
                onClick={() => setDrop(activeDropdown === 'admin' ? null : 'admin')}
                className={clsx(
                  'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all',
                  ['/dashboard/members','/dashboard/org','/dashboard/permissions','/dashboard/settings'].some(h => pathname.startsWith(h))
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
                )}
              >
                <Settings className="w-4 h-4" />
                <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', activeDropdown === 'admin' && 'rotate-180')} />
              </button>
              {activeDropdown === 'admin' && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-nav border border-gray-100 py-1.5 z-50">
                  {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeAll}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors mx-1.5 rounded-lg',
                        isActive(href) ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* @ Ticket alerts — visível apenas para admins (controle interno) */}
          {isAdmin && <BellPanel
            type="alerts"
            count={alertCount}
            title="Alertas de tickets"
            onClear={currentWorkspace ? () => markAllAlerts(currentWorkspace.id) : undefined}
          >
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <AtSign className="w-8 h-8 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">Nenhum alerta pendente</p>
              </div>
            ) : alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  if (currentWorkspace) markAlertRead(a.id, currentWorkspace.id);
                  router.push(`/dashboard/tickets/${a.board_id}/${a.ticket_id}`);
                  setOpenBell(null);
                }}
              >
                <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', a.type === 'assigned' ? 'bg-blue-50' : 'bg-indigo-50')}>
                  {a.type === 'assigned' ? <UserCheck className="w-4 h-4 text-blue-500" /> : <AtSign className="w-4 h-4 text-indigo-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{a.ticket_title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}</p>
                </div>
              </div>
            ))}
          </BellPanel>}

          {/* ⚠ CRM alerts */}
          <BellPanel
            type="crm"
            count={crmAlertCount}
            title="Alertas de leads"
            onClear={currentWorkspace ? () => markAllCrmAlerts(currentWorkspace.id) : undefined}
          >
            {crmAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <AlertTriangle className="w-8 h-8 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">Nenhum alerta pendente</p>
              </div>
            ) : crmAlerts.map((a) => {
              const cfg = CRM_NOTIF_CFG[a.type as keyof typeof CRM_NOTIF_CFG] ?? CRM_NOTIF_CFG.lead_stale;
              const Icon = cfg.icon;
              return (
                <div
                  key={a.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    if (currentWorkspace) markCrmRead(a.id, currentWorkspace.id);
                    if (a.conversation_id) router.push(`/dashboard/conversations?id=${a.conversation_id}`);
                    setOpenBell(null);
                  }}
                >
                  <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
                    <Icon className={clsx('w-4 h-4', cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}</p>
                  </div>
                </div>
              );
            })}
          </BellPanel>

          {/* 🔔 Notifications */}
          <BellPanel
            type="notif"
            count={unreadCount}
            title="Notificações"
            onClear={markAllRead}
          >
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <Bell className="w-8 h-8 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">Nenhuma notificação ainda</p>
              </div>
            ) : notifications.map((n) => {
              const cfg = NOTIF_CFG[n.type as keyof typeof NOTIF_CFG] ?? NOTIF_CFG.new_message;
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  onClick={() => { if (n.url) { router.push(n.url); setOpenBell(null); } }}
                  className={clsx('flex items-start gap-3 px-4 py-3 transition-colors', n.url && 'cursor-pointer hover:bg-gray-50', !n.read && 'bg-blue-50/40')}
                >
                  <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
                    <Icon className={clsx('w-4 h-4', cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={clsx('text-[10px] font-bold uppercase tracking-wide', cfg.color)}>{cfg.label}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ptBR })}</p>
                  </div>
                </div>
              );
            })}
          </BellPanel>

          {/* User menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setUserOpen(!userOpen)}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-700 hidden lg:block max-w-[100px] truncate">
                {user?.name?.split(' ')[0]}
              </span>
              <ChevronDown className={clsx('w-3.5 h-3.5 text-gray-400 hidden lg:block transition-transform', userOpen && 'rotate-180')} />
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-nav border border-gray-100 py-1.5 z-50">
                <div className="px-3 py-2 border-b border-gray-100 mb-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <Link
                  href="/dashboard/profile"
                  onClick={closeAll}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 mx-1.5 rounded-lg transition-colors"
                >
                  <User className="w-4 h-4" /> Perfil
                </Link>
                <button
                  onClick={() => useAuth.getState().logout()}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 mx-1.5 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={toggleMobile}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={closeMobile} />
          <div className="fixed top-14 left-0 right-0 bg-white z-50 md:hidden shadow-nav border-b border-gray-100 max-h-[80vh] overflow-y-auto">
            <div className="p-4 space-y-1">
              {/* Workspace info */}
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-gray-50 rounded-lg">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {currentWorkspace?.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{currentWorkspace?.name}</p>
                  <p className="text-[10px] text-gray-500 truncate">{currentOrg?.name}</p>
                </div>
              </div>

              <Link href="/dashboard" onClick={closeMobile}
                className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                  pathname === '/dashboard' ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50')}>
                Início
              </Link>

              {allMobileGroups.map(({ label, items }) => {
                const filtered = filterItems(items);
                if (filtered.length === 0) return null;
                return (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">{label}</p>
                    {filtered.map(({ href, label: lbl, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={closeMobile}
                        className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          isActive(href) ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50')}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {lbl}
                      </Link>
                    ))}
                  </div>
                );
              })}

              {(isAdmin || permissions?.reports) && (
                <Link href="/dashboard/relatorios" onClick={closeMobile}
                  className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                    isActive('/dashboard/relatorios') ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50')}>
                  <BarChart2 className="w-4 h-4" /> Relatórios
                </Link>
              )}

              {isAdmin && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">Administração</p>
                  {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href} onClick={closeMobile}
                      className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive(href) ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50')}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-100 pt-2 mt-2">
                <Link href="/dashboard/profile" onClick={closeMobile}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <User className="w-4 h-4" /> Perfil
                </Link>
                <button
                  onClick={() => useAuth.getState().logout()}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
