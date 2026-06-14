'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { PropertyVisit } from '@/types';
import {
  CalendarCheck, Building2, User, Phone, Clock, Sparkles, Check, X, Loader,
} from 'lucide-react';
import clsx from 'clsx';
import { format, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABELS: Record<PropertyVisit['status'], string> = {
  proposta:  'Proposta',
  confirmada: 'Confirmada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
};

const STATUS_STYLES: Record<PropertyVisit['status'], string> = {
  proposta:   'bg-yellow-100 text-yellow-700',
  confirmada: 'bg-green-100 text-green-700',
  realizada:  'bg-gray-100 text-gray-500',
  cancelada:  'bg-red-100 text-red-700',
};

function groupLabel(date: Date): string {
  if (isToday(date))    return 'Hoje';
  if (isTomorrow(date)) return 'Amanhã';
  return format(date, "EEEE, dd/MM", { locale: ptBR });
}

export default function VisitasPage() {
  const { currentWorkspace } = useAuth();
  const [visits,   setVisits]   = useState<PropertyVisit[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get<PropertyVisit[]>(`/workspaces/${currentWorkspace.id}/visits`);
      setVisits(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(visit: PropertyVisit, status: PropertyVisit['status']) {
    if (!currentWorkspace || updating) return;
    setUpdating(visit.id);
    try {
      const { data } = await api.put<PropertyVisit>(
        `/workspaces/${currentWorkspace.id}/visits/${visit.id}`,
        { status }
      );
      setVisits(prev => prev.map(v => v.id === visit.id ? data : v));
    } finally {
      setUpdating(null);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Visitas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  // Agrupa visitas por dia (ordem já vem ASC do backend)
  const groups: { label: string; items: PropertyVisit[] }[] = [];
  for (const visit of visits) {
    const date  = new Date(visit.scheduled_at);
    const label = groupLabel(date);
    const last  = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(visit);
    else groups.push({ label, items: [visit] });
  }

  return (
    <>
      <Header title="Visitas" />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4 h-28 animate-pulse" />
            ))
          ) : visits.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <CalendarCheck className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Nenhuma visita agendada.</p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </h2>
                <div className="space-y-3">
                  {group.items.map(visit => (
                    <div key={visit.id} className="card p-4">
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center
                                        flex-shrink-0 overflow-hidden">
                          {visit.property_cover_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={visit.property_cover_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Building2 className="w-6 h-6 text-gray-300" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-gray-900 text-sm truncate">
                              {visit.property_code} · {visit.property_title}
                            </div>
                            <span className={clsx('flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[visit.status])}>
                              {STATUS_LABELS[visit.status]}
                            </span>
                          </div>

                          {visit.contact_name && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{visit.contact_name}</span>
                              {visit.contact_phone && (
                                <span className="flex items-center gap-1 text-gray-400">
                                  <Phone className="w-3 h-3" />{visit.contact_phone}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {format(new Date(visit.scheduled_at), 'HH:mm')}
                          </div>

                          {visit.created_by_ai && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-indigo-500">
                              <Sparkles className="w-3 h-3 flex-shrink-0" />
                              Proposta pela Lais
                            </div>
                          )}

                          {visit.notes && (
                            <p className="text-xs text-gray-400 mt-1.5">{visit.notes}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      {(visit.status === 'proposta' || visit.status === 'confirmada') && (
                        <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-100">
                          {visit.status === 'proposta' && (
                            <button
                              onClick={() => handleStatusChange(visit, 'confirmada')}
                              disabled={updating === visit.id}
                              className="btn-primary text-xs flex items-center gap-1.5 flex-1 justify-center disabled:opacity-50"
                            >
                              {updating === visit.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                              Confirmar
                            </button>
                          )}
                          {visit.status === 'confirmada' && (
                            <button
                              onClick={() => handleStatusChange(visit, 'realizada')}
                              disabled={updating === visit.id}
                              className="btn-primary text-xs flex items-center gap-1.5 flex-1 justify-center disabled:opacity-50"
                            >
                              {updating === visit.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                              Marcar como realizada
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusChange(visit, 'cancelada')}
                            disabled={updating === visit.id}
                            className="btn-secondary text-xs flex items-center gap-1.5 px-3 disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
