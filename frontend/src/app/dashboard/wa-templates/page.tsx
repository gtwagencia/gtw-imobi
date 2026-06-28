'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  Plus, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, Copy, MessageSquare, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Types ──────────────────────────────────────────────────────────────────

interface Variant {
  id: string;
  variant_index: number;
  name: string;
  body: string;
  status: string;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
}

interface Batch {
  id: string;
  base_name: string;
  category: string;
  language: string;
  base_body: string;
  header_text: string | null;
  footer_text: string | null;
  status: string;
  variant_count: number;
  created_by_name: string | null;
  created_at: string;
  variants: Variant[] | null;
}

interface FormData {
  baseName: string;
  category: string;
  language: string;
  headerText: string;
  footerText: string;
  baseBody: string;
  variantCount: number;
}

// ── Status helpers ─────────────────────────────────────────────────────────

const BATCH_STATUS: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  generating: { label: 'Gerando',   color: 'bg-blue-100 text-blue-700',   icon: Loader2 },
  submitted:  { label: 'Enviado',   color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved:   { label: 'Aprovado',  color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  rejected:   { label: 'Rejeitado', color: 'bg-red-100 text-red-600',      icon: XCircle },
  failed:     { label: 'Falhou',    color: 'bg-red-100 text-red-600',      icon: AlertCircle },
  partial:    { label: 'Parcial',   color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
};

const VARIANT_STATUS: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  pending:   { label: 'Pendente',  color: 'text-yellow-600', icon: Clock },
  approved:  { label: 'Aprovado',  color: 'text-green-600',  icon: CheckCircle },
  rejected:  { label: 'Rejeitado', color: 'text-red-600',    icon: XCircle },
  flagged:   { label: 'Sinalizado',color: 'text-orange-600', icon: AlertCircle },
  disabled:  { label: 'Desabilitado', color: 'text-gray-500', icon: XCircle },
  failed:    { label: 'Falhou',    color: 'text-red-600',    icon: AlertCircle },
};

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const LANGUAGES  = [
  { code: 'pt_BR', label: 'Português (Brasil)' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'es_ES', label: 'Español' },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function WaTemplatesPage() {
  const { currentWorkspace, currentOrg } = useAuth();
  const [batches, setBatches]     = useState<Batch[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({});
  const [syncing, setSyncing]     = useState<Record<string, boolean>>({});

  const [form, setForm] = useState<FormData>({
    baseName: '', category: 'MARKETING', language: 'pt_BR',
    headerText: '', footerText: '', baseBody: '', variantCount: 5,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const wsId  = currentWorkspace?.id;
  const orgId = currentOrg?.id;

  const load = useCallback(async () => {
    if (!wsId || !orgId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${wsId}/wa-templates`);
      setBatches(data.data || []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [wsId, orgId]);

  useEffect(() => { load(); }, [load]);

  function handleField(field: keyof FormData, value: string | number) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post(`/workspaces/${wsId}/wa-templates`, {
        baseName:     form.baseName,
        category:     form.category,
        language:     form.language,
        headerText:   form.headerText || undefined,
        footerText:   form.footerText || undefined,
        baseBody:     form.baseBody,
        variantCount: form.variantCount,
      });
      setBatches(prev => [data, ...prev]);
      setShowModal(false);
      setForm({ baseName: '', category: 'MARKETING', language: 'pt_BR', headerText: '', footerText: '', baseBody: '', variantCount: 5 });
      setExpanded(prev => ({ ...prev, [data.id]: true }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Erro ao criar batch. Verifique o WABA ID e token nas configurações.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSync(batchId: string) {
    if (!wsId) return;
    setSyncing(s => ({ ...s, [batchId]: true }));
    try {
      const { data } = await api.post(`/workspaces/${wsId}/wa-templates/${batchId}/sync`);
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, ...data } : b));
    } catch { /* silencioso */ }
    finally { setSyncing(s => ({ ...s, [batchId]: false })) ; }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const batchStatusConfig = (s: string) => BATCH_STATUS[s] || BATCH_STATUS['submitted'];
  const varStatusConfig   = (s: string) => VARIANT_STATUS[s] || VARIANT_STATUS['pending'];

  return (
    <div className="flex flex-col h-full">
      <Header title="Templates WhatsApp com IA" />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Crie templates com variações geradas por IA e submeta para aprovação da Meta automaticamente.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Sparkles size={15} />
            Criar com IA
          </button>
        </div>

        {/* Batch list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-gray-400" size={28} />
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum template criado ainda</p>
            <p className="text-sm mt-1">Clique em &quot;Criar com IA&quot; para começar</p>
          </div>
        ) : (
          batches.map(batch => {
            const sc   = batchStatusConfig(batch.status);
            const Icon = sc.icon;
            const isOpen = !!expanded[batch.id];
            const variants = Array.isArray(batch.variants) ? batch.variants.filter(Boolean) : [];

            return (
              <div key={batch.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Batch header */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <button
                    onClick={() => toggleExpand(batch.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{batch.base_name}</span>
                        <span className="text-xs text-gray-400">{batch.category} · {batch.language}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{batch.base_body}</p>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${sc.color}`}>
                      <Icon size={12} className={batch.status === 'generating' ? 'animate-spin' : ''} />
                      {sc.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(batch.created_at), "d 'de' MMM", { locale: ptBR })}
                    </span>
                    <button
                      onClick={() => handleSync(batch.id)}
                      disabled={!!syncing[batch.id]}
                      title="Sincronizar status com Meta"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={15} className={syncing[batch.id] ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                {/* Variants (expandable) */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
                    {variants.length === 0 ? (
                      <p className="text-sm text-gray-400">Gerando variações...</p>
                    ) : variants.map(v => {
                      const vs   = varStatusConfig(v.status);
                      const VIcon = vs.icon;
                      return (
                        <div key={v.id} className="bg-white rounded-lg border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-gray-400">{v.name}</span>
                                <VIcon size={13} className={vs.color} />
                                <span className={`text-xs font-medium ${vs.color}`}>{vs.label}</span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{v.body}</p>
                              {v.rejection_reason && (
                                <p className="mt-2 text-xs text-red-500 italic">Motivo: {v.rejection_reason}</p>
                              )}
                            </div>
                            <button
                              onClick={() => navigator.clipboard.writeText(v.body)}
                              title="Copiar corpo"
                              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          {v.approved_at && (
                            <p className="mt-1.5 text-xs text-green-600">
                              Aprovado em {format(new Date(v.approved_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de criação */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-brand-600" />
                <h2 className="font-semibold text-gray-900">Criar Template com IA</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do template <span className="text-gray-400 font-normal">(somente letras, números e _)</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.baseName}
                  onChange={e => handleField('baseName', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="ex: oferta_imovel_lago"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">As variações serão nomeadas {form.baseName || 'nome'}_v1, _v2, etc.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <select
                    value={form.category}
                    onChange={e => handleField('category', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                  <select
                    value={form.language}
                    onChange={e => handleField('language', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cabeçalho <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.headerText}
                  onChange={e => handleField('headerText', e.target.value)}
                  placeholder="Texto do cabeçalho (deixe vazio para ignorar)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Corpo da mensagem <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={form.baseBody}
                  onChange={e => handleField('baseBody', e.target.value)}
                  placeholder={"Olá {{1}}, temos um imóvel que combina com o que você procura! Quer saber mais?"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Use {'{{1}}'}, {'{{2}}'} para variáveis. A IA vai gerar variações diferentes mantendo os placeholders.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rodapé <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.footerText}
                  onChange={e => handleField('footerText', e.target.value)}
                  placeholder="Ex: Não quer mais receber mensagens? Responda SAIR"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de variações: <strong>{form.variantCount}</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={form.variantCount}
                  onChange={e => handleField('variantCount', parseInt(e.target.value, 10))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>1</span>
                  <span>10</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  A IA gera {form.variantCount} {form.variantCount === 1 ? 'variação' : 'variações'} e todas são submetidas ao Meta simultaneamente.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 size={15} className="animate-spin" /> Gerando e enviando...</>
                  ) : (
                    <><Sparkles size={15} /> Gerar e Submeter</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
