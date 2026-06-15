'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import type { PropertyComparison, Property } from '@/types';
import {
  PROPERTY_TYPE_LABELS, PURPOSE_LABELS, STATUS_LABELS,
  formatCurrency, formatArea, propertyPriceLabel,
} from '@/lib/propertyConstants';
import { Loader2, Printer, Building2 } from 'lucide-react';

const ROWS: { label: string; render: (p: Property) => React.ReactNode }[] = [
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
];

export default function PublicComparisonPage() {
  const { token } = useParams<{ token: string }>();
  const [comparison, setComparison] = useState<PropertyComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/comparisons/${token}`);
        setComparison(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">
        Comparativo não encontrado ou expirado.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            {comparison.workspace?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={comparison.workspace.logo_url} alt="" className="h-10 w-auto" />
            )}
            <div>
              <h1 className="font-display text-lg font-semibold text-gray-900">
                {comparison.title || 'Comparativo de imóveis'}
              </h1>
              {comparison.workspace?.name && (
                <p className="text-sm text-gray-500">{comparison.workspace.name}</p>
              )}
            </div>
          </div>
          <button className="btn-secondary text-sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-400 w-40">&nbsp;</th>
                {comparison.properties.map(p => (
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
                  {comparison.properties.map(p => (
                    <td key={p.id} className="p-3 text-gray-900">{row.render(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
