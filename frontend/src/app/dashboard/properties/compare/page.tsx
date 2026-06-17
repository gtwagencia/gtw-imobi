'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Property } from '@/types';
import {
  PROPERTY_TYPE_LABELS, PURPOSE_LABELS, STATUS_LABELS,
  formatCurrency, formatArea, propertyPriceLabel,
} from '@/lib/propertyConstants';
import { ArrowLeft, Loader2, Printer, Link as LinkIcon, Check, Copy, Building2 } from 'lucide-react';

export default function ComparePropertiesPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = (searchParams.get('ids') || '').split(',').filter(Boolean);

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [shareUrl,   setShareUrl]   = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    if (!currentWorkspace || !ids.length) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          ids.map(id => api.get(`/workspaces/${currentWorkspace.id}/properties/${id}`).then(r => r.data))
        );
        setProperties(results);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentWorkspace, ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerateLink() {
    if (!currentWorkspace) return;
    setGenerating(true);
    try {
      const { data } = await api.post(`/workspaces/${currentWorkspace.id}/comparisons`, {
        propertyIds: ids,
        title: `Comparativo de ${properties.length} imóveis`,
      });
      setShareUrl(`${window.location.origin}/comparar/${data.token}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Comparar imóveis" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Comparar imóveis" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </>
    );
  }

  if (properties.length < 2) {
    return (
      <>
        <Header title="Comparar imóveis" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-center px-4">
          Selecione ao menos 2 imóveis na listagem para comparar.
        </div>
      </>
    );
  }

  const ROWS: { label: string; render: (p: Property) => React.ReactNode }[] = [
    { label: 'Código', render: p => <span className="font-mono text-xs">{p.code}</span> },
    { label: 'Tipo', render: p => PROPERTY_TYPE_LABELS[p.property_type] },
    { label: 'Finalidade', render: p => PURPOSE_LABELS[p.purpose] },
    { label: 'Status', render: p => STATUS_LABELS[p.status] },
    { label: 'Preço', render: p => <span className="font-semibold text-brand-700">{propertyPriceLabel(p)}</span> },
    { label: 'Condomínio', render: p => formatCurrency(p.condo_fee) },
    { label: 'IPTU', render: p => formatCurrency(p.iptu) },
    { label: 'Área total', render: p => formatArea(p.total_area) },
    { label: 'Área construída', render: p => formatArea(p.built_area) },
    { label: 'Quartos', render: p => p.bedrooms ?? '—' },
    { label: 'Suítes', render: p => p.suites ?? '—' },
    { label: 'Banheiros', render: p => p.bathrooms ?? '—' },
    { label: 'Vagas', render: p => p.parking_spots ?? '—' },
    { label: 'Bairro / Cidade', render: p => [p.neighborhood, p.city].filter(Boolean).join(', ') || '—' },
    { label: 'Corretor', render: p => p.broker_name || '—' },
  ];

  return (
    <>
      <Header
        title="Comparar imóveis"
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/imoveis')}>
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            <button className="btn-secondary text-sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Exportar PDF
            </button>
            <button className="btn-primary text-sm" disabled={generating} onClick={handleGenerateLink}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              Gerar link público
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {shareUrl && (
          <div className="card p-3 mb-4 flex items-center gap-2 print:hidden">
            <input className="input font-mono text-xs flex-1" readOnly value={shareUrl} onClick={(e) => e.currentTarget.select()} />
            <button className="btn-ghost px-2 flex-shrink-0" onClick={handleCopy} title="Copiar">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-400 w-40">&nbsp;</th>
                {properties.map(p => (
                  <th key={p.id} className="p-3 text-left min-w-[200px]">
                    <div className="w-full h-28 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center mb-2">
                      {p.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.cover_url} alt={p.title} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-8 h-8 text-gray-300" />
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 line-clamp-2">{p.title}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-gray-50/60' : ''}>
                  <td className="p-3 text-xs font-medium text-gray-500 whitespace-nowrap">{row.label}</td>
                  {properties.map(p => (
                    <td key={p.id} className="p-3 text-gray-900">{row.render(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
