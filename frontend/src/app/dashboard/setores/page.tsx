'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { DepartmentOverview } from '@/types';
import { MessageSquare, Briefcase, Wallet, Clock, Users, ChevronRight, Gauge } from 'lucide-react';

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatAvgResponse(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SetoresPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuth();
  const [departments, setDepartments] = useState<DepartmentOverview[]>([]);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get<DepartmentOverview[]>(
        `/workspaces/${currentWorkspace.id}/departments/overview`
      );
      setDepartments(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Setores" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Setores" />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4 h-56 animate-pulse" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Gauge className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">Nenhum departamento cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(dept => (
              <div key={dept.id} className="card p-4 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dept.color }}
                    />
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{dept.name}</h3>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                    <Users className="w-3.5 h-3.5" />
                    {dept.agent_count}
                  </span>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Conversas abertas
                    </div>
                    <div className="text-xl font-bold text-gray-900">{dept.open_conversations}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                      <Briefcase className="w-3.5 h-3.5" />
                      Deals ativos
                    </div>
                    <div className="text-xl font-bold text-gray-900">{dept.active_deals}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                      <Wallet className="w-3.5 h-3.5" />
                      Valor em funil
                    </div>
                    <div className="text-sm font-bold text-gray-900">{currencyFmt.format(dept.pipeline_value)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      Tempo médio
                    </div>
                    <div className="text-sm font-bold text-gray-900">{formatAvgResponse(dept.avg_response_seconds)}</div>
                  </div>
                </div>

                {/* Deals by stage */}
                {dept.deals_by_stage.length > 0 && (
                  <div className="space-y-1 mb-3 flex-1">
                    {dept.deals_by_stage.map(s => (
                      <div key={s.stage_name} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.stage_color }}
                        />
                        <span className="text-gray-600 truncate flex-1">{s.stage_name}</span>
                        <span className="font-medium text-gray-900">{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Shortcuts */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-auto">
                  <button
                    onClick={() => router.push('/dashboard/conversations')}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    Conversas
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => router.push('/dashboard/kanban')}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    Funil
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
