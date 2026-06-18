'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { RefreshCw, AlertCircle, Info, AlertTriangle, XCircle, Search } from 'lucide-react';
import clsx from 'clsx';

interface LogEntry {
  ts:      string;
  level:   string;
  message: string;
  meta?:   string;
}

const LEVEL_CONFIG: Record<string, { icon: React.ReactNode; cls: string; bg: string }> = {
  error: { icon: <XCircle      className="w-3.5 h-3.5" />, cls: 'text-red-600',    bg: 'bg-red-50'     },
  warn:  { icon: <AlertTriangle className="w-3.5 h-3.5" />, cls: 'text-amber-600',  bg: 'bg-amber-50'   },
  info:  { icon: <Info         className="w-3.5 h-3.5" />, cls: 'text-blue-600',   bg: 'bg-blue-50'    },
  debug: { icon: <AlertCircle  className="w-3.5 h-3.5" />, cls: 'text-gray-500',   bg: 'bg-gray-50'    },
};

function levelKey(level: string) {
  const l = level.replace(/\[[0-9;]*m/g, '').toLowerCase();
  if (l.includes('error')) return 'error';
  if (l.includes('warn'))  return 'warn';
  if (l.includes('debug')) return 'debug';
  return 'info';
}

export default function LogsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.is_super_admin === true;

  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('');
  const [level,   setLevel]   = useState<'all' | 'error' | 'warn' | 'info'>('all');
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

  useEffect(() => { if (isSuperAdmin) fetchLogs(); }, [isSuperAdmin, fetchLogs]);

  if (!isSuperAdmin) {
    return (
      <>
        <Header title="Logs do Sistema" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Acesso restrito a superadmin.
        </div>
      </>
    );
  }

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
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  return (
    <>
      <Header title="Logs do Sistema" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Toolbar */}
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
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="text-xs text-gray-400 mb-2">
          {filtered.length} de {logs.length} registros (últimos {logs.length} em memória)
        </div>

        {/* Log list */}
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
                  <span className={clsx('flex-1 break-all', open ? 'whitespace-pre-wrap' : 'truncate', cfg.cls === 'text-red-600' ? 'text-red-700' : 'text-gray-800')}>
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
    </>
  );
}
