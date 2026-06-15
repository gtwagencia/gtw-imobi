'use client';

import { useState } from 'react';
import api from '@/lib/api';
import type { Property } from '@/types';
import { formatCurrency } from '@/lib/propertyConstants';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';

interface CmaPanelProps {
  workspaceId: string;
  property: Property;
  onUpdate: (updated: Property) => void;
}

export default function CmaPanel({ workspaceId, property, onUpdate }: CmaPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<Property>(`/workspaces/${workspaceId}/properties/${property.id}/cma`, {});
      onUpdate(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha ao gerar avaliação');
    } finally {
      setLoading(false);
    }
  }

  const hasResult = property.cma_generated_at != null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Avaliação de preço (IA)</h3>
          <p className="text-xs text-gray-400 mt-0.5">Análise comparativa de mercado com base em imóveis semelhantes do catálogo</p>
        </div>
        <button className="btn-secondary text-sm" disabled={loading} onClick={handleGenerate}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : hasResult ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Gerando...' : hasResult ? 'Atualizar avaliação' : 'Gerar avaliação'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-3">{error}</div>
      )}

      {hasResult ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs text-gray-400">Valor sugerido</p>
              <p className="text-2xl font-display font-semibold text-brand-700">{formatCurrency(property.cma_suggested_price)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Faixa estimada</p>
              <p className="text-sm font-medium text-gray-700">
                {formatCurrency(property.cma_price_min)} – {formatCurrency(property.cma_price_max)}
              </p>
            </div>
          </div>
          {property.cma_analysis && (
            <p className="text-sm text-gray-600 leading-relaxed">{property.cma_analysis}</p>
          )}
          {property.cma_generated_at && (
            <p className="text-xs text-gray-400">
              Gerado em {new Date(property.cma_generated_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      ) : !error && (
        <p className="text-sm text-gray-400">
          Nenhuma avaliação gerada ainda. Clique em &quot;Gerar avaliação&quot; para que a IA sugira uma faixa de preço com base em imóveis comparáveis do catálogo.
        </p>
      )}
    </div>
  );
}
