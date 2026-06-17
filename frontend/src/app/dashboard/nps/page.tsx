'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { Star, ThumbsUp, ThumbsDown, Minus, MessageCircle } from 'lucide-react';

interface NpsMetrics {
  nps_score: number;
  total: number;
  promoters: number;
  neutrals: number;
  detractors: number;
}

interface NpsResponse {
  id: string;
  score: number;
  comment: string | null;
  responded_at: string;
  contact_name: string | null;
  contact_phone: string | null;
  property_title: string | null;
  property_code: string | null;
}

function scoreBadge(score: number) {
  if (score >= 9) return 'bg-green-100 text-green-700';
  if (score >= 7) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-600';
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NpsPage() {
  const { currentWorkspace } = useAuth();
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<NpsMetrics | null>(null);
  const [responses, setResponses] = useState<NpsResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const endDate   = new Date().toISOString();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    try {
      const [mRes, rRes] = await Promise.all([
        api.get(`/workspaces/${currentWorkspace.id}/nps/metrics`, { params: { startDate, endDate } }),
        api.get(`/workspaces/${currentWorkspace.id}/nps/recent`, { params: { limit: 50 } }),
      ]);
      setMetrics(mRes.data);
      setResponses(rRes.data || []);
    } catch {
      setMetrics(null);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, days]);

  useEffect(() => { load(); }, [load]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="NPS Pós-Visita" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  const scoreColor = !metrics
    ? '#6b7280'
    : metrics.nps_score >= 50
      ? '#16a34a'
      : metrics.nps_score >= 0
        ? '#d97706'
        : '#dc2626';

  const scoreBorder = !metrics
    ? '#e5e7eb'
    : metrics.nps_score >= 50
      ? '#22c55e'
      : metrics.nps_score >= 0
        ? '#f59e0b'
        : '#ef4444';

  return (
    <>
      <Header
        title="NPS Pós-Visita"
        actions={
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  days === d ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Métricas */}
            {metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div
                  className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center rounded-2xl border-2 p-5"
                  style={{ borderColor: scoreBorder }}
                >
                  <span className="text-4xl font-black" style={{ color: scoreColor }}>
                    {metrics.nps_score >= 0 ? '+' : ''}{metrics.nps_score}
                  </span>
                  <span className="text-xs font-semibold text-gray-500 mt-1">Score NPS</span>
                  <span className="text-[10px] text-gray-400">{metrics.total} respostas</span>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl bg-green-50 p-4">
                  <ThumbsUp className="w-5 h-5 text-green-600 mb-1" />
                  <span className="text-2xl font-bold text-green-700">{metrics.promoters}</span>
                  <span className="text-xs text-green-600 font-medium">Promotores</span>
                  <span className="text-[10px] text-gray-400">nota 9–10</span>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 p-4">
                  <Minus className="w-5 h-5 text-gray-500 mb-1" />
                  <span className="text-2xl font-bold text-gray-700">{metrics.neutrals}</span>
                  <span className="text-xs text-gray-600 font-medium">Neutros</span>
                  <span className="text-[10px] text-gray-400">nota 7–8</span>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl bg-red-50 p-4">
                  <ThumbsDown className="w-5 h-5 text-red-500 mb-1" />
                  <span className="text-2xl font-bold text-red-600">{metrics.detractors}</span>
                  <span className="text-xs text-red-500 font-medium">Detratores</span>
                  <span className="text-[10px] text-gray-400">nota 0–6</span>
                </div>
              </div>
            )}

            {/* Lista de respostas */}
            {responses.length === 0 ? (
              <div className="card p-10 flex flex-col items-center justify-center text-center gap-3">
                <Star className="w-10 h-10 text-gray-200" />
                <p className="text-gray-500 font-medium">Nenhuma resposta de NPS ainda — ative nas Configurações e aguarde visitas realizadas</p>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-900 text-sm">Respostas individuais</h2>
                {responses.map(r => (
                  <div key={r.id} className="card p-5">
                    <div className="flex items-start gap-4">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${scoreBadge(r.score)}`}>
                        {r.score}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 text-sm">
                            {r.contact_name || r.contact_phone || 'Contato desconhecido'}
                          </span>
                          {r.property_code && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                              {r.property_code}
                            </span>
                          )}
                        </div>
                        {r.property_title && (
                          <p className="text-xs text-gray-500 mb-1.5 truncate">{r.property_title}</p>
                        )}
                        {r.comment && (
                          <div className="flex items-start gap-1.5 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                            <MessageCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-gray-700 leading-relaxed">{r.comment}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(r.responded_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
