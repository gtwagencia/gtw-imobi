'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  RefreshCw, AlertCircle, Info, AlertTriangle, XCircle, Search,
  User, Building2, Home, Inbox, Settings, Shield, LogIn, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

// ── System log (ring buffer) ────────────────────────────────────────────────

interface LogEntry {
  ts:      string;
  level:   string;
  message: string;
  meta?:   string;
}

const LEVEL_CONFIG: Record<string, { icon: React.ReactNode; cls: string; bg: string }> = {
  error: { icon: <XCircle       className="w-3.5 h-3.5" />, cls: 'text-red-600',   bg: 'bg-red-50'   },
  warn:  { icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: 'text-amber-600', bg: 'bg-amber-50' },
  info:  { icon: <Info          className="w-3.5 h-3.5" />, cls: 'text-blue-600',  bg: 'bg-blue-50'  },
  debug: { icon: <AlertCircle   className="w-3.5 h-3.5" />, cls: 'text-gray-500',  bg: 'bg-gray-50'  },
};

function levelKey(level: string) {
  const l = level.replace(/\[[0-9;]*m/g, '').toLowerCase();
  if (l.includes('error')) return 'error';
  if (l.includes('warn'))  return 'warn';
  if (l.includes('debug')) return 'debug';
  return 'info';
}

// ── Audit log ───────────────────────────────────────────────────────────────

interface AuditEntry {
  id:           string;
  action:       string;
  entity_type:  string | null;
  entity_id:    string | null;
  entity_name:  string | null;
  metadata:     Record<string, unknown> | null;
  ip_address:   string | null;
  created_at:   string;
  user_name:    string | null;
  user_email:   string | null;
  user_avatar:  string | null;
}

const ACTION_LABELS: Record<string, string> = {
  'workspace.update':                  'Configurações atualizadas',
  'workspace.modules_update':          'Módulos atualizados',
  'workspace.site_token_regenerated':  'Token do site regenerado',
  'workspace.custom_domain_verified':  'Domínio personalizado verificado',
  'property.created':                  'Imóvel cadastrado',
  'property.updated':                  'Imóvel atualizado',
  'property.deleted':                  'Imóvel excluído',
  'inbox.created':                     'Inbox criada',
  'inbox.updated':                     'Inbox atualizada',
  'inbox.deleted':                     'Inbox excluída',
  'contact.created':                   'Contato criado',
  'contact.updated':                   'Contato atualizado',
  'contact.deleted':                   'Contato excluído',
  'contact.merge':                     'Contatos mesclados',
  'member.role_changed':               'Função de membro alterada',
  'member.removed':                    'Membro removido',
  'member.password_reset':             'Senha redefinida',
  'permission_profile.update':         'Perfil de permissão atualizado',
  'auth.account_locked':               'Conta bloqueada por tentativas',
  '2fa.enable':                        '2FA ativado',
  '2fa.disable':                       '2FA desativado',
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  property:   <Home    className="w-3.5 h-3.5" />,
  inbox:      <Inbox   className="w-3.5 h-3.5" />,
  contact:    <User    className="w-3.5 h-3.5" />,
  workspace:  <Building2 className="w-3.5 h-3.5" />,
  user:       <User    className="w-3.5 h-3.5" />,
  permission: <Shield  className="w-3.5 h-3.5" />,
};

const ACTION_COLORS: Record<string, string> = {
  created:  'bg-green-100 text-green-700',
  updated:  'bg-blue-100  text-blue-700',
  deleted:  'bg-red-100   text-red-700',
  locked:   'bg-amber-100 text-amber-700',
  removed:  'bg-red-100   text-red-700',
  reset:    'bg-purple-100 text-purple-700',
  enabled:  'bg-green-100 text-green-700',
  disabled: 'bg-gray-100  text-gray-600',
};

function actionBadgeClass(action: string): string {
  if (action.includes('created') || action.includes('enable')) return ACTION_COLORS.created;
  if (action.includes('deleted') || action.includes('removed') || action.includes('disable')) return ACTION_COLORS.deleted;
  if (action.includes('locked')) return ACTION_COLORS.locked;
  if (action.includes('reset'))  return ACTION_COLORS.reset;
  return ACTION_COLORS.updated;
}

function initials(name: string | null, email: string | null): string {
  const n = name || email || '?';
  return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return 'agora';
  if (mins < 60)  return `${mins}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7)   return `${days}d atrás`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Main page ───────────────────────────────────────────────────────────────

type Tab = 'activity' | 'system';

export default function LogsPage() {
  const { user, currentOrg, currentWorkspace } = useAuth();
  const isSuperAdmin    = user?.is_super_admin === true;
  const isPlatformAdmin = isSuperAdmin || currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  const [tab, setTab] = useState<Tab>('activity');

  if (!isPlatformAdmin) {
    return (
      <>
        <Header title="Logs" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Acesso restrito a administradores.
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Logs" />
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tabs */}
        <div className="border-b border-gray-200 px-4 md:px-6 flex gap-6">
          {([
            { key: 'activity', label: 'Atividade' },
            ...(isSuperAdmin ? [{ key: 'system', label: 'Sistema' }] : []),
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'activity' && <ActivityTab />}
          {tab === 'system'   && <SystemTab />}
        </div>
      </div>
    </>
  );
}

// ── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab() {
  const { currentOrg, currentWorkspace } = useAuth();

  const [entries,    setEntries]    = useState<AuditEntry[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [hasMore,    setHasMore]    = useState(false);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [entityType, setEntityType] = useState('');
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (opts: { replace?: boolean; searchVal?: string; entityTypeVal?: string } = {}) => {
    if (!currentOrg || !currentWorkspace) return;
    setLoading(true);
    setError('');
    const offset     = opts.replace ? 0 : entries.length;
    const searchQ    = opts.searchVal    ?? search;
    const entityTypeQ = opts.entityTypeVal ?? entityType;
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (searchQ)    params.set('search',     searchQ);
      if (entityTypeQ) params.set('entityType', entityTypeQ);

      const { data } = await api.get<AuditEntry[]>(
        `/orgs/${currentOrg.id}/workspaces/${currentWorkspace.id}/audit-logs?${params}`
      );
      setEntries(prev => opts.replace ? data : [...prev, ...data]);
      setHasMore(data.length === 50);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao carregar atividade');
    } finally {
      setLoading(false);
    }
  }, [currentOrg, currentWorkspace, entries.length, search, entityType]);

  useEffect(() => { load({ replace: true }); }, [currentWorkspace?.id]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load({ replace: true, searchVal: val }), 400);
  }

  function handleEntityType(val: string) {
    setEntityType(val);
    load({ replace: true, entityTypeVal: val });
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="p-4 md:p-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Buscar por usuário, entidade, ação…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <select
            className="input text-sm pr-8 appearance-none"
            value={entityType}
            onChange={e => handleEntityType(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="property">Imóveis</option>
            <option value="contact">Contatos</option>
            <option value="inbox">Inboxes</option>
            <option value="workspace">Workspace</option>
            <option value="user">Membros</option>
            <option value="permission">Permissões</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <button
          onClick={() => load({ replace: true })}
          disabled={loading}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Entry list */}
      <div className="space-y-1">
        {!loading && entries.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">Nenhuma atividade encontrada.</div>
        )}
        {entries.map(entry => {
          const open  = expanded.has(entry.id);
          const label = ACTION_LABELS[entry.action] || entry.action;
          const icon  = ENTITY_ICONS[entry.entity_type || ''] || <Settings className="w-3.5 h-3.5" />;
          const badge = actionBadgeClass(entry.action);
          const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0;

          return (
            <div
              key={entry.id}
              onClick={() => hasMeta && toggleExpand(entry.id)}
              className={clsx(
                'rounded-lg border border-gray-100 bg-white px-4 py-3 transition-colors',
                hasMeta && 'cursor-pointer hover:border-gray-200',
                open && 'border-gray-200 bg-gray-50'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {initials(entry.user_name, entry.user_email)}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {entry.user_name || entry.user_email || 'Sistema'}
                    </span>
                    <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', badge)}>
                      {icon}
                      {label}
                    </span>
                    {entry.entity_name && (
                      <span className="text-sm text-gray-600 truncate">
                        {entry.entity_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400" title={new Date(entry.created_at).toLocaleString('pt-BR')}>
                      {relativeTime(entry.created_at)}
                    </span>
                    {entry.ip_address && (
                      <span className="text-xs text-gray-300">· {entry.ip_address}</span>
                    )}
                  </div>
                </div>

                {hasMeta && (
                  <ChevronDown className={clsx('w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
                )}
              </div>

              {open && hasMeta && (
                <pre className="mt-3 ml-11 text-[11px] text-gray-500 bg-gray-100 rounded-lg p-3 whitespace-pre-wrap break-all overflow-x-auto">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => load()}
          disabled={loading}
          className="mt-4 w-full btn-secondary text-sm"
        >
          {loading ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}

// ── System Tab (ring buffer) ──────────────────────────────────────────────────

function SystemTab() {
  const [logs,     setLogs]     = useState<LogEntry[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState('');
  const [level,    setLevel]    = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<LogEntry[]>('/admin/logs?limit=300');
      setLogs(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter(l => {
    const lk = levelKey(l.level);
    if (level !== 'all' && lk !== level) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return l.message.toLowerCase().includes(q) || (l.meta || '').toLowerCase().includes(q);
    }
    return true;
  });

  function toggleExpand(i: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Filtrar mensagens…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="flex gap-1 border border-gray-200 rounded-lg p-1">
          {(['all', 'error', 'warn', 'info'] as const).map(lv => (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={clsx(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                level === lv ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {lv === 'all' ? 'Todos' : lv.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="text-xs text-gray-400 mb-2">
        {filtered.length} de {logs.length} registros (últimos {logs.length} em memória)
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 font-mono text-xs">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            {loading ? 'Carregando…' : 'Nenhum registro encontrado.'}
          </div>
        )}
        {filtered.map((log, i) => {
          const lk   = levelKey(log.level);
          const cfg  = LEVEL_CONFIG[lk] || LEVEL_CONFIG.info;
          const open = expanded.has(i);
          const ts   = new Date(log.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const date = new Date(log.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          return (
            <div
              key={i}
              className={clsx('px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors', open && cfg.bg)}
              onClick={() => toggleExpand(i)}
            >
              <div className="flex items-start gap-2">
                <span className={clsx('flex-shrink-0 mt-0.5', cfg.cls)}>{cfg.icon}</span>
                <span className="text-gray-400 flex-shrink-0 w-16">{date} {ts}</span>
                <span className={clsx('w-10 flex-shrink-0 font-bold uppercase', cfg.cls)}>{lk}</span>
                <span className={clsx('flex-1 break-all', open ? 'whitespace-pre-wrap' : 'truncate', lk === 'error' ? 'text-red-700' : 'text-gray-800')}>
                  {log.message}
                </span>
              </div>
              {open && log.meta && (
                <pre className="mt-2 ml-6 text-gray-500 text-[10px] whitespace-pre-wrap break-all bg-gray-100 rounded p-2 overflow-x-auto">
                  {log.meta}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
