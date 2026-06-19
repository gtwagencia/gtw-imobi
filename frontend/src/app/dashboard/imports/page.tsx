'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api, { API_URL } from '@/lib/api';
import {
  Upload, Clock, CheckCircle, AlertCircle, Loader2,
  XCircle, RefreshCw, Play, Trash2, ToggleLeft, ToggleRight, Save,
} from 'lucide-react';
import clsx from 'clsx';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ImportJob {
  id: string;
  source: string;
  source_url: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  total: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  error_message: string | null;
  created_at: string;
}

interface ImportResult {
  created_count: number;
  updated_count: number;
  error_count: number;
  total?: number;
}

interface FeedConfig {
  id: string;
  source: string;
  url: string;
  interval_hours: number;
  is_active: boolean;
  last_run_at: string | null;
  last_result: ImportResult | null;
  last_error: string | null;
  created_at: string;
}

interface SourceCard {
  value: string;
  label: string;
  description: string;
  placeholder: string;
  verified: boolean;
  hint?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SOURCE_CARDS: SourceCard[] = [
  {
    value: 'praedium', label: 'Praedium',
    description: 'Feed VRSync via central de conexões',
    placeholder: 'https://assets.praedium.com.br/…-vrsync.xml',
    verified: true,
    hint: 'No Praedium, vá em Integrações → Central de Conexões e copie o link do feed VRSync.',
  },
  {
    value: 'imoview', label: 'Imoview',
    description: 'Feed XML padrão RNXML do Imoview',
    placeholder: 'https://…',
    verified: true,
    hint: 'No Imoview, localize o link do feed XML em Configurações → Integrações → Feed de Imóveis.',
  },
  {
    value: 'kenlo', label: 'Kenlo / Jetimob',
    description: 'Feed XML padrão RNXML',
    placeholder: 'https://…',
    verified: false,
  },
  {
    value: 'vistasoft', label: 'Vista Soft',
    description: 'Feed XML padrão RNXML',
    placeholder: 'https://…',
    verified: false,
  },
  {
    value: 'rnxml', label: 'Feed RNXML',
    description: 'ZAP, VivaReal, OLX e outros portais',
    placeholder: 'https://…',
    verified: false,
  },
  {
    value: 'csv_url', label: 'CSV via URL',
    description: 'Planilha em formato CSV acessível por link',
    placeholder: 'https://…/imoveis.csv',
    verified: false,
  },
];

const INTERVAL_OPTIONS = [
  { value: 1,  label: 'A cada 1 hora' },
  { value: 6,  label: 'A cada 6 horas' },
  { value: 12, label: 'A cada 12 horas' },
  { value: 24, label: '1 vez por dia' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function sourceLabel(value: string) {
  return SOURCE_CARDS.find(s => s.value === value)?.label || value;
}

function statusBadge(status: ImportJob['status']) {
  switch (status) {
    case 'pending':    return 'bg-gray-100 text-gray-600';
    case 'processing': return 'bg-blue-100 text-blue-700';
    case 'done':       return 'bg-green-100 text-green-700';
    case 'error':      return 'bg-red-100 text-red-600';
  }
}

function statusLabel(status: ImportJob['status']) {
  switch (status) {
    case 'pending':    return 'Pendente';
    case 'processing': return 'Processando';
    case 'done':       return 'Concluído';
    case 'error':      return 'Erro';
  }
}

function StatusIcon({ status }: { status: ImportJob['status'] }) {
  switch (status) {
    case 'pending':    return <Clock className="w-3.5 h-3.5" />;
    case 'processing': return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
    case 'done':       return <CheckCircle className="w-3.5 h-3.5" />;
    case 'error':      return <AlertCircle className="w-3.5 h-3.5" />;
  }
}

function ImportResultBanner({ result }: { result: ImportResult }) {
  const total = result.total ?? (result.created_count + result.updated_count + result.error_count);
  const hasErrors = result.error_count > 0;

  if (total === 0) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Nenhum imóvel foi importado.</strong> Verifique se a URL está correta, se o
          sistema selecionado corresponde ao feed e se o feed está acessível publicamente.
        </span>
      </div>
    );
  }

  return (
    <div className={clsx('rounded-lg border px-4 py-3', hasErrors ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200')}>
      <p className={clsx('text-xs font-medium mb-2', hasErrors ? 'text-amber-700' : 'text-green-700')}>
        {total} imóvel{total !== 1 ? 'is' : ''} processado{total !== 1 ? 's' : ''}
      </p>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        {result.created_count > 0 && (
          <span className="text-green-700 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            {result.created_count} criado{result.created_count !== 1 ? 's' : ''}
          </span>
        )}
        {result.updated_count > 0 && (
          <span className="text-blue-700 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            {result.updated_count} atualizado{result.updated_count !== 1 ? 's' : ''}
          </span>
        )}
        {result.error_count > 0 && (
          <span className="text-red-600 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            {result.error_count} com erro
          </span>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(dateStr: string | null) {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Agora mesmo';
  if (mins < 60)  return `Há ${mins} min`;
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${days} dia${days !== 1 ? 's' : ''}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'url' | 'auto' | 'csv' | 'history';

export default function ImportsPage() {
  const { currentWorkspace } = useAuth();
  const [tab, setTab] = useState<Tab>('url');

  // Via URL state
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [urlValue, setUrlValue]             = useState('');
  const [urlLoading, setUrlLoading]         = useState(false);
  const [urlResult, setUrlResult]           = useState<ImportResult | null>(null);
  const [urlError, setUrlError]             = useState<string | null>(null);

  // Salvar feed após importação
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [saveInterval, setSaveInterval]     = useState(24);
  const [saving, setSaving]                 = useState(false);
  const [savedFeedId, setSavedFeedId]       = useState<string | null>(null);

  // Via CSV state
  const [csvFile, setCsvFile]     = useState<File | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null);
  const [csvError, setCsvError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feeds automáticos
  const [feeds, setFeeds]               = useState<FeedConfig[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [runningFeed, setRunningFeed]   = useState<string | null>(null);

  // Histórico
  const [jobs, setJobs]               = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const currentCard = SOURCE_CARDS.find(s => s.value === selectedSource);

  function selectSource(value: string) {
    setSelectedSource(value);
    setUrlValue('');
    setUrlResult(null);
    setUrlError(null);
    setShowSavePrompt(false);
    setSavedFeedId(null);
  }

  async function handleUrlImport() {
    if (!currentWorkspace || !urlValue.trim() || !selectedSource) return;
    setUrlLoading(true);
    setUrlResult(null);
    setUrlError(null);
    setShowSavePrompt(false);
    setSavedFeedId(null);
    try {
      const { data } = await api.post(`/workspaces/${currentWorkspace.id}/imports/url`, {
        url: urlValue.trim(),
        source: selectedSource,
      });
      setUrlResult(data);
      // Só mostra prompt de salvar se algo foi processado
      if ((data.total ?? 0) > 0 || (data.created_count + data.updated_count) > 0) {
        setShowSavePrompt(true);
      }
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      setUrlError(d?.error || d?.message || 'Erro ao importar. Verifique a URL e tente novamente.');
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleSaveFeed() {
    if (!currentWorkspace || !selectedSource || !urlValue.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/workspaces/${currentWorkspace.id}/imports/feeds`, {
        source: selectedSource,
        url: urlValue.trim(),
        intervalHours: saveInterval,
      });
      setSavedFeedId(data.id);
      setShowSavePrompt(false);
      // Recarrega feeds se estiver na aba
      if (tab === 'auto') loadFeeds();
    } catch {
      // silently ignore — pode já existir
    } finally {
      setSaving(false);
    }
  }

  async function loadFeeds() {
    if (!currentWorkspace) return;
    setFeedsLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/imports/feeds`);
      setFeeds(data || []);
    } catch { setFeeds([]); }
    finally { setFeedsLoading(false); }
  }

  async function toggleFeed(id: string, isActive: boolean) {
    if (!currentWorkspace) return;
    try {
      const { data } = await api.patch(`/workspaces/${currentWorkspace.id}/imports/feeds/${id}`, { isActive: !isActive });
      setFeeds(prev => prev.map(f => f.id === id ? data : f));
    } catch {}
  }

  async function updateFeedInterval(id: string, intervalHours: number) {
    if (!currentWorkspace) return;
    try {
      const { data } = await api.patch(`/workspaces/${currentWorkspace.id}/imports/feeds/${id}`, { intervalHours });
      setFeeds(prev => prev.map(f => f.id === id ? data : f));
    } catch {}
  }

  async function deleteFeed(id: string) {
    if (!currentWorkspace) return;
    if (!confirm('Remover este feed automático?')) return;
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/imports/feeds/${id}`);
      setFeeds(prev => prev.filter(f => f.id !== id));
    } catch {}
  }

  async function runFeed(id: string) {
    if (!currentWorkspace || runningFeed) return;
    setRunningFeed(id);
    try {
      await api.post(`/workspaces/${currentWorkspace.id}/imports/feeds/${id}/run`);
      await loadFeeds();
    } catch {}
    finally { setRunningFeed(null); }
  }

  async function handleCsvImport() {
    if (!currentWorkspace || !csvFile) return;
    setCsvLoading(true);
    setCsvResult(null);
    setCsvError(null);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const { data } = await api.post(`/workspaces/${currentWorkspace.id}/imports/csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCsvResult(data);
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      setCsvError(d?.error || d?.message || 'Erro ao importar o arquivo. Verifique o formato e tente novamente.');
    } finally {
      setCsvLoading(false);
    }
  }

  async function loadJobs() {
    if (!currentWorkspace) return;
    setJobsLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/imports/jobs`);
      setJobs(data || []);
    } catch { setJobs([]); }
    finally { setJobsLoading(false); }
  }

  useEffect(() => {
    if (tab === 'auto')    loadFeeds();
    if (tab === 'history') loadJobs();
  }, [tab, currentWorkspace]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Importar Imóveis" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header title="Importar Imóveis" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
          {([
            { key: 'url',     label: 'Via Feed / URL' },
            { key: 'auto',    label: 'Sincronização automática' },
            { key: 'csv',     label: 'Via CSV' },
            { key: 'history', label: 'Histórico' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
              {t.key === 'auto' && feeds.length > 0 && (
                <span className="ml-1.5 text-xs bg-brand-100 text-brand-700 rounded-full px-1.5 py-0.5 font-semibold">
                  {feeds.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Aba Via URL ─────────────────────────────────────────────────────── */}
        {tab === 'url' && (
          <div className="max-w-3xl space-y-6">

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Selecione o sistema de origem</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SOURCE_CARDS.map(card => (
                  <button
                    key={card.value}
                    onClick={() => selectSource(card.value)}
                    className={clsx(
                      'relative text-left rounded-xl border-2 p-4 transition-all hover:border-brand-400',
                      selectedSource === card.value
                        ? 'border-brand-500 bg-brand-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    )}
                  >
                    {card.verified && (
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-1.5 py-0.5">
                        <CheckCircle className="w-2.5 h-2.5" /> Testado
                      </span>
                    )}
                    <p className={clsx(
                      'font-semibold text-sm mb-0.5',
                      selectedSource === card.value ? 'text-brand-700' : 'text-gray-900'
                    )}>
                      {card.label}
                    </p>
                    <p className="text-xs text-gray-500 leading-snug">{card.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedSource && currentCard && (
              <div className="card p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL do feed — <span className="font-semibold text-brand-600">{currentCard.label}</span>
                  </label>
                  <input
                    type="url"
                    className="input"
                    placeholder={currentCard.placeholder}
                    value={urlValue}
                    onChange={e => { setUrlValue(e.target.value); setUrlResult(null); setUrlError(null); setShowSavePrompt(false); }}
                    onKeyDown={e => e.key === 'Enter' && urlValue.trim() && handleUrlImport()}
                    autoFocus
                  />
                  {currentCard.hint && (
                    <p className="mt-1.5 text-xs text-gray-400">{currentCard.hint}</p>
                  )}
                </div>

                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={handleUrlImport}
                  disabled={urlLoading || !urlValue.trim()}
                >
                  {urlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {urlLoading ? 'Importando...' : 'Importar agora'}
                </button>

                {urlResult && <ImportResultBanner result={urlResult} />}

                {/* Prompt para salvar feed automático */}
                {showSavePrompt && !savedFeedId && (
                  <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-800">Salvar para sincronização automática</p>
                      <p className="text-xs text-brand-600 mt-0.5">
                        O sistema vai verificar este feed automaticamente e importar novidades sem você precisar repetir o processo.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        className="input text-sm py-1.5 w-auto"
                        value={saveInterval}
                        onChange={e => setSaveInterval(Number(e.target.value))}
                      >
                        {INTERVAL_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button
                        className="btn-primary text-sm flex items-center gap-1.5 py-1.5"
                        onClick={handleSaveFeed}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {saving ? 'Salvando...' : 'Salvar feed'}
                      </button>
                      <button
                        className="text-xs text-gray-400 hover:text-gray-600"
                        onClick={() => setShowSavePrompt(false)}
                      >
                        Agora não
                      </button>
                    </div>
                  </div>
                )}

                {savedFeedId && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    Feed salvo! Acesse a aba <button onClick={() => setTab('auto')} className="underline font-medium">Sincronização automática</button> para gerenciar.
                  </div>
                )}

                {urlError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {urlError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Aba Sincronização Automática ─────────────────────────────────────── */}
        {tab === 'auto' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Feeds salvos são verificados automaticamente no intervalo configurado. Imóveis novos são criados e os existentes atualizados pelo código — sem duplicatas.
                </p>
              </div>
              <button onClick={loadFeeds} disabled={feedsLoading} className="btn-secondary text-sm flex items-center gap-1.5 ml-4 flex-shrink-0">
                <RefreshCw className={clsx('w-3.5 h-3.5', feedsLoading && 'animate-spin')} />
                Atualizar
              </button>
            </div>

            {feedsLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : feeds.length === 0 ? (
              <div className="card p-10 flex flex-col items-center justify-center text-center gap-3">
                <RefreshCw className="w-10 h-10 text-gray-200" />
                <p className="text-gray-500 font-medium">Nenhum feed automático configurado</p>
                <p className="text-sm text-gray-400">
                  Importe via URL e salve o feed para sincronização automática.
                </p>
                <button onClick={() => setTab('url')} className="btn-primary text-sm mt-1">
                  Ir para Via Feed / URL
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {feeds.map(feed => (
                  <div key={feed.id} className={clsx('card p-4', !feed.is_active && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{sourceLabel(feed.source)}</span>
                          {feed.is_active
                            ? <span className="text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5 font-medium">Ativo</span>
                            : <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 font-medium">Pausado</span>
                          }
                        </div>

                        {/* URL */}
                        <p className="text-xs text-gray-400 truncate mb-2">{feed.url}</p>

                        {/* Intervalo */}
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span className="text-xs text-gray-500">Verificar:</span>
                          <select
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 bg-white"
                            value={feed.interval_hours}
                            onChange={e => updateFeedInterval(feed.id, Number(e.target.value))}
                          >
                            {INTERVAL_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <span className="text-xs text-gray-400">
                            Última verificação: <strong>{formatRelative(feed.last_run_at)}</strong>
                          </span>
                        </div>

                        {/* Último resultado */}
                        {feed.last_result && !feed.last_error && (
                          <div className="flex flex-wrap gap-3 text-xs font-medium">
                            <span className="text-green-600">{feed.last_result.created_count ?? 0} criados</span>
                            <span className="text-blue-600">{feed.last_result.updated_count ?? 0} atualizados</span>
                            {(feed.last_result.error_count ?? 0) > 0 && (
                              <span className="text-red-500">{feed.last_result.error_count} erros</span>
                            )}
                            <span className="text-gray-400">{feed.last_result.total ?? 0} total</span>
                          </div>
                        )}
                        {feed.last_error && (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            {feed.last_error}
                          </p>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => runFeed(feed.id)}
                          disabled={!!runningFeed}
                          title="Executar agora"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          {runningFeed === feed.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => toggleFeed(feed.id, feed.is_active)}
                          title={feed.is_active ? 'Pausar' : 'Ativar'}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          {feed.is_active
                            ? <ToggleRight className="w-4 h-4 text-green-600" />
                            : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteFeed(feed.id)}
                          title="Remover"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Aba Via CSV ─────────────────────────────────────────────────────── */}
        {tab === 'csv' && (
          <div className="max-w-2xl space-y-5">
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Importar via CSV</h2>
                <p className="text-sm text-gray-500">
                  Use o template para garantir que os campos estejam corretos. O sistema atualiza
                  imóveis existentes pelo código.
                </p>
              </div>
              <a
                href={`${API_URL}/workspaces/${currentWorkspace.id}/imports/template.csv`}
                download
                className="btn-secondary inline-flex items-center gap-2 text-sm"
              >
                Baixar template CSV
              </a>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Arquivo CSV</label>
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  {csvFile
                    ? <p className="text-sm font-medium text-gray-700">{csvFile.name}</p>
                    : <p className="text-sm text-gray-400">Clique para selecionar um arquivo .csv</p>
                  }
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setCsvFile(f);
                    setCsvResult(null);
                    setCsvError(null);
                  }}
                />
              </div>
              {csvFile && (
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={handleCsvImport}
                  disabled={csvLoading}
                >
                  {csvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {csvLoading ? 'Importando...' : 'Importar'}
                </button>
              )}
              {csvResult && <ImportResultBanner result={csvResult} />}
              {csvError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {csvError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Aba Histórico ─────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {jobs.length} execução{jobs.length !== 1 ? 'ões' : ''} registrada{jobs.length !== 1 ? 's' : ''}
              </p>
              <button onClick={loadJobs} disabled={jobsLoading} className="btn-secondary text-sm flex items-center gap-1.5">
                <RefreshCw className={clsx('w-3.5 h-3.5', jobsLoading && 'animate-spin')} />
                Atualizar
              </button>
            </div>

            {jobsLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="card p-10 flex flex-col items-center justify-center text-center gap-3">
                <Upload className="w-10 h-10 text-gray-200" />
                <p className="text-gray-500 font-medium">Nenhuma importação realizada ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => (
                  <div key={job.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={clsx(
                            'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                            statusBadge(job.status)
                          )}>
                            <StatusIcon status={job.status} />
                            {statusLabel(job.status)}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">{sourceLabel(job.source)}</span>
                        </div>
                        {job.source_url && (
                          <p className="text-xs text-gray-400 truncate mb-1.5">{job.source_url}</p>
                        )}
                        {job.status === 'done' && (
                          <div className="flex flex-wrap gap-3 text-xs font-medium">
                            <span className="text-green-600">{job.created_count} criados</span>
                            <span className="text-blue-600">{job.updated_count} atualizados</span>
                            {job.error_count > 0 && <span className="text-red-500">{job.error_count} erros</span>}
                            <span className="text-gray-400">{job.total} total</span>
                          </div>
                        )}
                        {job.status === 'error' && job.error_message && (
                          <p className="text-xs text-red-600 mt-1">{job.error_message}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(job.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
