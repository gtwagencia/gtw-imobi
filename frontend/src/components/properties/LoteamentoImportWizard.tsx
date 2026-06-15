'use client';

import { useState } from 'react';
import api from '@/lib/api';
import type { DevelopmentImportJob, DevelopmentImportLot } from '@/types';
import { STATUS_LABELS } from '@/lib/propertyConstants';
import { Upload, Loader2, X, Check, Trash2, AlertCircle, FileText } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  workspaceId: string;
  developmentId: string;
  onClose: () => void;
  onImported: () => void;
}

const STATUS_OPTIONS: DevelopmentImportLot['status'][] = ['disponivel', 'reservado', 'vendido'];

export default function LoteamentoImportWizard({ workspaceId, developmentId, onClose, onImported }: Props) {
  const [job,        setJob]        = useState<DevelopmentImportJob | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error,      setError]      = useState('');

  async function handleFile(file: File) {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<DevelopmentImportJob>(
        `/workspaces/${workspaceId}/developments/${developmentId}/imports`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setJob(data);
      if (data.status === 'error') setError(data.error_message || 'Falha ao processar o PDF');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Falha ao enviar o arquivo');
    } finally {
      setUploading(false);
    }
  }

  function updateLot(idx: number, patch: Partial<DevelopmentImportLot>) {
    if (!job) return;
    const lots = job.extracted_lots.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    setJob({ ...job, extracted_lots: lots });
  }

  function removeLot(idx: number) {
    if (!job) return;
    setJob({ ...job, extracted_lots: job.extracted_lots.filter((_, i) => i !== idx) });
  }

  function addLot() {
    if (!job) return;
    setJob({
      ...job,
      extracted_lots: [...job.extracted_lots, { blockLabel: null, lotLabel: '', totalArea: null, salePrice: null, status: 'disponivel' }],
    });
  }

  async function handleConfirm() {
    if (!job) return;
    setConfirming(true);
    setError('');
    try {
      await api.put(`/workspaces/${workspaceId}/developments/${developmentId}/imports/${job.id}`, { lots: job.extracted_lots });
      await api.post(`/workspaces/${workspaceId}/developments/${developmentId}/imports/${job.id}/confirm`, {});
      onImported();
      onClose();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Falha ao confirmar importação');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Importar loteamento (PDF)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!job && (
            <label className={clsx(
              'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors',
              uploading ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50/30'
            )}>
              {uploading ? <Loader2 className="w-8 h-8 text-brand-500 animate-spin" /> : <Upload className="w-8 h-8 text-gray-400" />}
              <p className="text-sm font-medium text-gray-700">
                {uploading ? 'Processando PDF com IA...' : 'Clique para enviar o PDF do loteamento'}
              </p>
              <p className="text-xs text-gray-400 text-center max-w-sm">
                A IA vai identificar quadras, lotes, áreas e valores automaticamente.
                Você poderá revisar e editar tudo antes de confirmar.
              </p>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 text-red-700 text-sm rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {job && job.status === 'error' && (
            <div className="mt-4">
              <button className="btn-secondary text-sm" onClick={() => { setJob(null); setError(''); }}>
                Tentar novamente
              </button>
            </div>
          )}

          {job && job.status !== 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{job.source_filename}</span>
                <span className="badge-blue text-xs ml-auto whitespace-nowrap">{job.extracted_lots.length} lotes identificados</span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Quadra</th>
                      <th className="text-left px-3 py-2 font-medium">Lote</th>
                      <th className="text-left px-3 py-2 font-medium">Área (m²)</th>
                      <th className="text-left px-3 py-2 font-medium">Valor (R$)</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {job.extracted_lots.map((lot, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1">
                          <input
                            className="input py-1"
                            value={lot.blockLabel ?? ''}
                            onChange={(e) => updateLot(idx, { blockLabel: e.target.value || null })}
                            placeholder="Quadra A"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className="input py-1"
                            value={lot.lotLabel}
                            onChange={(e) => updateLot(idx, { lotLabel: e.target.value })}
                            placeholder="Lote 01"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            className="input py-1 w-24"
                            value={lot.totalArea ?? ''}
                            onChange={(e) => updateLot(idx, { totalArea: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            className="input py-1 w-28"
                            value={lot.salePrice ?? ''}
                            onChange={(e) => updateLot(idx, { salePrice: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <select
                            className="input py-1"
                            value={lot.status}
                            onChange={(e) => updateLot(idx, { status: e.target.value as DevelopmentImportLot['status'] })}
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button onClick={() => removeLot(idx)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {job.extracted_lots.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                          Nenhum lote. Adicione manualmente abaixo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button onClick={addLot} className="btn-secondary text-sm">
                + Adicionar lote manualmente
              </button>
            </div>
          )}
        </div>

        {job && job.status !== 'error' && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
            <button className="btn-secondary text-sm" onClick={onClose}>Cancelar</button>
            <button className="btn-primary text-sm" disabled={confirming || job.extracted_lots.length === 0} onClick={handleConfirm}>
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirming ? 'Importando...' : `Importar ${job.extracted_lots.length} lote${job.extracted_lots.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
