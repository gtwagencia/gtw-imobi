'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Deal, Pipeline } from '@/types';
import {
  MessageSquare, Phone, ChevronRight, ArrowRight,
  Building2, Clock, AlertCircle, User, ListChecks,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function responseTimeColor(seconds: number | null): string {
  if (seconds === null) return 'text-gray-400';
  if (seconds < 300)   return 'text-green-600';
  if (seconds < 1800)  return 'text-yellow-600';
  return 'text-red-600';
}

function getNextStage(deal: Deal, pipelines: Pipeline[]) {
  const pipeline = pipelines.find(p => p.id === deal.pipeline_id);
  if (!pipeline) return null;
  const sorted = [...pipeline.stages].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex(s => s.id === deal.stage_id);
  if (idx === -1 || idx === sorted.length - 1) return null;
  return sorted[idx + 1];
}

export default function MeusLeadsPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuth();
  const [deals,     setDeals]     = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [advancing, setAdvancing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [dealsRes, pipelinesRes] = await Promise.all([
        api.get<Deal[]>(`/workspaces/${currentWorkspace.id}/kanban/my-deals`),
        api.get<Pipeline[]>(`/workspaces/${currentWorkspace.id}/pipelines`),
      ]);
      setDeals(dealsRes.data);
      setPipelines(pipelinesRes.data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleAdvance(deal: Deal) {
    if (!currentWorkspace || advancing) return;
    const next = getNextStage(deal, pipelines);
    if (!next) return;
    setAdvancing(deal.id);
    try {
      await api.put(`/workspaces/${currentWorkspace.id}/kanban/deals/${deal.id}`, { stageId: next.id });
      setDeals(prev => prev
        .map(d => d.id === deal.id ? {
          ...d,
          stage_id: next.id,
          stage_name: next.name,
          stage_color: next.color,
          stage_position: next.position,
          stage_is_default: next.is_default,
        } : d)
        .sort((a, b) => (a.stage_position - b.stage_position) || (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())));
    } finally {
      setAdvancing(null);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Meus Leads" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Meus Leads" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4 h-32 animate-pulse" />
            ))
          ) : deals.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <ListChecks className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Nenhum lead atribuído a você no momento.</p>
            </div>
          ) : (
            deals.map(deal => {
              const hasUnread   = (deal.unread_count ?? 0) > 0;
              const isWaiting   = hasUnread && deal.last_inbound_at && !deal.conv_status?.includes('resolved');
              const waitingTime = deal.last_inbound_at
                ? formatDistanceToNow(new Date(deal.last_inbound_at), { locale: ptBR, addSuffix: false })
                : null;
              const next = getNextStage(deal, pipelines);
              const onlyDigits = deal.contact_phone?.replace(/\D/g, '') || '';

              return (
                <div key={deal.id} className={clsx(
                  'card p-4',
                  hasUnread && 'border-l-4 border-l-brand-500'
                )}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{deal.title}</div>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                        <User className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{deal.contact_name}</span>
                        {deal.contact_phone && <span className="text-gray-400 truncate">· {deal.contact_phone}</span>}
                      </div>
                    </div>
                    <span
                      className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${deal.stage_color}1a`, color: deal.stage_color }}
                    >
                      {deal.stage_name}
                    </span>
                  </div>

                  {/* Property */}
                  {deal.property_id && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{deal.property_code} · {deal.property_title}</span>
                    </div>
                  )}

                  {/* Value */}
                  {deal.value > 0 && (
                    <div className="text-sm font-semibold text-green-700 mb-1">
                      {currencyFmt.format(deal.value)}
                    </div>
                  )}

                  {/* Response time */}
                  {deal.response_time_seconds !== null && (
                    <div className={clsx('flex items-center gap-1 text-xs font-medium', responseTimeColor(deal.response_time_seconds))}>
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      1ª resposta: {formatResponseTime(deal.response_time_seconds)}
                    </div>
                  )}

                  {/* Waiting indicator */}
                  {isWaiting && waitingTime && (
                    <div className="flex items-center gap-1 text-xs text-orange-600 mt-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      Aguardando há {waitingTime}
                      {hasUnread && (
                        <span className="flex items-center gap-0.5 ml-1 text-brand-600">
                          <MessageSquare className="w-3 h-3" />
                          {deal.unread_count}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-100">
                    {onlyDigits && (
                      <a
                        href={`https://wa.me/${onlyDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs flex items-center gap-1.5 flex-1 justify-center"
                      >
                        <MessageSquare className="w-4 h-4" />
                        WhatsApp
                      </a>
                    )}
                    {deal.contact_phone && (
                      <a
                        href={`tel:${deal.contact_phone}`}
                        className="btn-secondary text-xs flex items-center gap-1.5 px-3"
                        title="Ligar"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {deal.conversation_id && (
                      <button
                        onClick={() => router.push(`/dashboard/conversations?id=${deal.conversation_id}`)}
                        className="btn-secondary text-xs flex items-center gap-1.5 px-3"
                        title="Abrir conversa"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {next && (
                      <button
                        onClick={() => handleAdvance(deal)}
                        disabled={advancing === deal.id}
                        className="btn-primary text-xs flex items-center gap-1.5 flex-1 justify-center disabled:opacity-50"
                        title={`Avançar para ${next.name}`}
                      >
                        {advancing === deal.id ? (
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                        Avançar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
