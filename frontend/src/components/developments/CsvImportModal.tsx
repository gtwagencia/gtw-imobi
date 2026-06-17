'use client';

import { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, Check, Loader2, Download } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/store/toast';
import clsx from 'clsx';

interface ImportResult {
  created: number;
  skipped: number;
  errors:  number;
  details: {
    created: { code: string; title: string }[];
    skipped: { line: number; reason: string }[];
    errors:  { line: number; error: string }[];
  };
}

interface Props {
  developmentId: string;
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const EXAMPLE_CSV = `quadra;lote;area_m2;frente;fundo;lateral_e;lateral_d;preco_base;zona
A;01;360;12;30;30;30;120000;Zona A
A;02;400;12;33.3;33.3;33.3;140000;Zona A
B;01;480;16;30;30;30;160000;Zona B
B;02;500;16.5;30.3;30.3;30.3;175000;Zona B`;

const EXAMPLE_CSV_PREDIO = `andar;numero_unidade;area_m2;preco_base;zona;tipo
1;101;65;380000;Andar Baixo;apartamento
1;102;72;420000;Andar Baixo;apartamento
2;201;65;395000;Andar Médio;apartamento
2;202;72;435000;Andar Médio;apartamento`;

export default function CsvImportModal({ developmentId, workspaceId, onClose, onSuccess }: Props) {
  const showToast = useToast(s => s.show);
  const fileRef   = useRef<HTMLInputElement>(null);

  const [csvText,  setCsvText]  = useState('');
  const [fileName, setFileName] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<ImportResult | null>(null);
  const [tab,      setTab]      = useState<'loteamento' | 'predio'>('loteamento');

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      setCsvText(ev.target?.result as string || '');
      setResult(null);
    };
    reader.readAsText(file, 'utf-8');
  }

  function downloadExample() {
    const csv = tab === 'loteamento' ? EXAMPLE_CSV : EXAMPLE_CSV_PREDIO;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `modelo_${tab}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!csvText.trim()) { showToast('Cole ou faça upload do arquivo CSV', 'error'); return; }
    setLoading(true);
    try {
      const { data } = await api.post(
        `/workspaces/${workspaceId}/developments/${developmentId}/units/import-csv`,
        { csv: csvText },
      );
      setResult(data);
      if (data.created > 0) showToast(`${data.created} unidades importadas com sucesso`);
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro na importação', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Importar Unidades via CSV</h2>
            <p className="text-xs text-gray-400 mt-0.5">Importe lotes, apartamentos ou salas em lote</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {!result ? (
            <>
              {/* Tabs tipo */}
              <div className="flex border border-gray-200 rounded-xl p-1 mb-4">
                {([
                  { key: 'loteamento', label: 'Loteamento / Condomínio' },
                  { key: 'predio',     label: 'Prédio / Apartamentos' },
                ] as { key: typeof tab; label: string }[]).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={clsx(
                      'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                      tab === t.key ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Colunas esperadas */}
              <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-600">Colunas esperadas ({tab === 'loteamento' ? 'separador , ou ;' : 'separador , ou ;'})</span>
                  <button onClick={downloadExample} className="text-brand-600 hover:underline flex items-center gap-1">
                    <Download className="w-3 h-3" /> Baixar modelo
                  </button>
                </div>
                {tab === 'loteamento' ? (
                  <code className="text-gray-500 block leading-relaxed">
                    quadra · lote · area_m2 · frente · fundo · lateral_e · lateral_d · preco_base · zona
                  </code>
                ) : (
                  <code className="text-gray-500 block leading-relaxed">
                    andar · numero_unidade · area_m2 · preco_base · zona · tipo
                  </code>
                )}
                <p className="text-gray-400 mt-1.5">
                  Colunas opcionais podem ser deixadas em branco. A primeira linha deve ser o cabeçalho.
                </p>
              </div>

              {/* Upload ou cola */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-all mb-3"
              >
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">
                  {fileName ? (
                    <span className="text-brand-600 flex items-center justify-center gap-1.5">
                      <FileText className="w-4 h-4" /> {fileName}
                    </span>
                  ) : 'Clique para fazer upload ou arraste o arquivo'}
                </p>
                <p className="text-xs text-gray-400 mt-1">CSV ou TXT — max 5 MB</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
              </div>

              <p className="text-center text-xs text-gray-400 mb-2">— ou cole o conteúdo do CSV —</p>
              <textarea
                className="input resize-none font-mono text-xs"
                rows={8}
                placeholder={tab === 'loteamento' ? EXAMPLE_CSV : EXAMPLE_CSV_PREDIO}
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setFileName(''); setResult(null); }}
              />
            </>
          ) : (
            /* Resultado */
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-3 text-center">
                  <div className="text-2xl font-black text-green-600">{result.created}</div>
                  <div className="text-xs text-gray-500">Criadas</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="text-2xl font-black text-amber-500">{result.skipped}</div>
                  <div className="text-xs text-gray-500">Ignoradas</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="text-2xl font-black text-red-500">{result.errors}</div>
                  <div className="text-xs text-gray-500">Erros</div>
                </div>
              </div>

              {result.details.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Erros
                  </p>
                  {result.details.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">Linha {e.line}: {e.error}</p>
                  ))}
                </div>
              )}

              {result.details.skipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-700 mb-2">Ignoradas (duplicatas)</p>
                  {result.details.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-amber-600">Linha {s.line}: {s.reason}</p>
                  ))}
                </div>
              )}

              {result.details.created.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-green-700 mb-2">Criadas com sucesso</p>
                  <div className="flex flex-wrap gap-1">
                    {result.details.created.map(c => (
                      <span key={c.code} className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{c.code}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          {result ? (
            <>
              <button onClick={() => { setResult(null); setCsvText(''); setFileName(''); }} className="btn-secondary">
                Nova importação
              </button>
              <button onClick={onSuccess} className="btn-primary">
                <Check className="w-4 h-4" /> Concluído
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button onClick={handleImport} className="btn-primary" disabled={loading || !csvText.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
