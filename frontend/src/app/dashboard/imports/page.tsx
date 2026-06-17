'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api, { API_URL } from '@/lib/api';
import { Upload, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

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
  finished_at: string | null;
}

interface ImportResult {
  created_count: number;
  updated_count: number;
  error_count: number;
}

const SOURCE_OPTIONS = [
  { value: 'auto',      label: 'Detectar automaticamente' },
  { value: 'imoview',   label: 'Imoview' },
  { value: 'praedium',  label: 'Praedium' },
  { value: 'kenlo',     label: 'Kenlo / Jetimob' },
  { value: 'vistasoft', label: 'Vista Soft' },
  { value: 'rnxml',     label: 'Feed RNXML (portais)' },
  { value: 'csv_url',   label: 'CSV via URL' },
];

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Tab = 'url' | 'csv' | 'history';

export default function ImportsPage() {
  const { currentWorkspace } = useAuth();
  const [tab, setTab] = useState<Tab>('url');

  const [urlValue, setUrlValue]     = useState('');
  const [source, setSource]         = useState('auto');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlResult, setUrlResult]   = useState<ImportResult | null>(null);
  const [urlError, setUrlError]     = useState<string | null>(null);

  const [csvFile, setCsvFile]       = useState<File | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult]   = useState<ImportResult | null>(null);
  const [csvError, setCsvError]     = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobs, setJobs]             = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  async function handleUrlImport() {
    if (!currentWorkspace || !urlValue.trim()) return;
    setUrlLoading(true);
    setUrlResult(null);
    setUrlError(null);
    try {
      const { data } = await api.post(`/workspaces/${currentWorkspace.id}/imports/url`, {
        url: urlValue.trim(),
        source,
      });
      setUrlResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setUrlError(msg || 'Erro ao importar. Verifique a URL e tente novamente.');
    } finally {
      setUrlLoading(false);
    }
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
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCsvError(msg || 'Erro ao importar o arquivo. Verifique o formato e tente novamente.');
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
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }

  useEffect(() => {
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
            { key: 'url',     label: 'Via URL' },
            { key: 'csv',     label: 'Via CSV' },
            { key: 'history', label: 'Histórico' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Aba Via URL */}
        {tab === 'url' && (
          <div className="max-w-2xl space-y-5">
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Importar via Feed / API</h2>
                <p className="text-sm text-gray-500">
                  Cole a URL do feed XML ou CSV do seu sistema atual. Os imóveis serão importados e, se já existirem pelo código, serão atualizados automaticamente.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL do feed</label>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://..."
                    value={urlValue}
                    onChange={e => setUrlValue(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sistema / tipo</label>
                  <select
                    className="input"
                    value={source}
                    onChange={e => setSource(e.target.value)}
                  >
                    {SOURCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleUrlImport}
                disabled={urlLoading || !urlValue.trim()}
              >
                {urlLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {urlLoading ? 'Importando...' : 'Importar agora'}
              </button>

              {urlResult && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
                  {urlResult.created_count} criados, {urlResult.updated_count} atualizados, {urlResult.error_count} erros
                </div>
              )}

              {urlError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {urlError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aba Via CSV */}
        {tab === 'csv' && (
          <div className="max-w-2xl space-y-5">
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Importar via CSV</h2>
                <p className="text-sm text-gray-500">
                  Use o template para garantir que os campos estejam corretos. O sistema atualiza imóveis existentes pelo código.
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
                  {csvFile ? (
                    <p className="text-sm font-medium text-gray-700">{csvFile.name}</p>
                  ) : (
                    <p className="text-sm text-gray-400">Clique para selecionar um arquivo .csv</p>
                  )}
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
                  {csvLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {csvLoading ? 'Importando...' : 'Importar'}
                </button>
              )}

              {csvResult && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
                  {csvResult.created_count} criados, {csvResult.updated_count} atualizados, {csvResult.error_count} erros
                </div>
              )}

              {csvError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {csvError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aba Histórico */}
        {tab === 'history' && (
          <div className="max-w-3xl">
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
                  <div key={job.id} className="card p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadge(job.status)}`}>
                            <StatusIcon status={job.status} />
                            {statusLabel(job.status)}
                          </span>
                          <span className="text-sm font-medium text-gray-700">{job.source}</span>
                        </div>

                        {job.source_url && (
                          <p className="text-xs text-gray-400 truncate mb-2">{job.source_url}</p>
                        )}

                        {job.status === 'done' && (
                          <div className="flex gap-4 text-xs text-gray-600">
                            <span className="text-green-600 font-medium">{job.created_count} criados</span>
                            <span className="text-blue-600 font-medium">{job.updated_count} atualizados</span>
                            {job.error_count > 0 && (
                              <span className="text-red-500 font-medium">{job.error_count} erros</span>
                            )}
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
