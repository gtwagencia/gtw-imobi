'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import type { ClientPortalData, ClientPortalProperty } from '@/types';
import {
  PROPERTY_TYPE_LABELS, PURPOSE_LABELS, STATUS_LABELS, STATUS_COLORS,
  DOCUMENT_CATEGORY_LABELS, EXCHANGE_STATUS_LABELS, EXCHANGE_STATUS_COLORS,
  CONSTRUCTION_STAGE_STATUS_LABELS, CONSTRUCTION_STAGE_STATUS_COLORS,
  formatCurrency,
} from '@/lib/propertyConstants';
import { Loader2, Printer, Building2, FileText, Download, HardHat, Repeat } from 'lucide-react';
import clsx from 'clsx';

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data,    setData]    = useState<ClientPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<ClientPortalData>(`/portal/${token}`);
        setData(data);
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

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">
        Portal não encontrado ou acesso revogado.
      </div>
    );
  }

  const { contact, workspace, properties } = data;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            {workspace?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logo_url} alt="" className="h-10 w-auto" />
            )}
            <div>
              <h1 className="font-display text-lg font-semibold text-gray-900">Olá, {contact.name}</h1>
              {workspace?.name && <p className="text-sm text-gray-500">{workspace.name}</p>}
            </div>
          </div>
          <button className="btn-secondary text-sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>

        {properties.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum imóvel disponível no momento.</p>
          </div>
        ) : (
          properties.map(item => <PropertyCard key={item.property.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function PropertyCard({ item }: { item: ClientPortalProperty }) {
  const { property, sale, exchanges, documents, construction_stages } = item;

  const address = [
    [property.street, property.number].filter(Boolean).join(', '),
    property.complement,
    property.neighborhood,
    [property.city, property.state].filter(Boolean).join(' - '),
  ].filter(Boolean).join(' · ');

  return (
    <div className="card p-6 space-y-5">
      {/* Imóvel */}
      <div className="flex gap-4">
        <div className="w-28 h-20 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
          {property.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={property.cover_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-8 h-8 text-gray-300" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{property.title}</p>
            <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[property.status])}>
              {STATUS_LABELS[property.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {property.code} · {PROPERTY_TYPE_LABELS[property.property_type]} · {PURPOSE_LABELS[property.purpose]}
          </p>
          {address && <p className="text-sm text-gray-500 mt-1">{address}</p>}
        </div>
      </div>

      {/* Condições de venda */}
      <div>
        <hr className="border-gray-100 mb-4" />
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Condições de pagamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-gray-400">Valor</span>
            <p className="font-semibold text-brand-700 text-lg">{formatCurrency(sale.sale_price)}</p>
          </div>
          {sale.sale_date && (
            <div>
              <span className="text-xs text-gray-400">Data</span>
              <p className="font-medium text-gray-900">{new Date(sale.sale_date).toLocaleDateString('pt-BR')}</p>
            </div>
          )}
        </div>
        {(sale.down_payment != null || sale.installments_count != null || sale.financing_value != null) && (
          <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 flex flex-wrap gap-4">
            {sale.down_payment != null && (
              <span>Entrada: <strong className="text-gray-900">{formatCurrency(sale.down_payment)}</strong></span>
            )}
            {sale.installments_count != null && (
              <span>Parcelas: <strong className="text-gray-900">{sale.installments_count}x {formatCurrency(sale.installment_value)}</strong></span>
            )}
            {sale.financing_value != null && (
              <span>Financiamento: <strong className="text-gray-900">{formatCurrency(sale.financing_value)}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Permutas */}
      {exchanges.length > 0 && (
        <div>
          <hr className="border-gray-100 mb-4" />
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Repeat className="w-4 h-4 text-gray-400" />
            Permutas
          </h2>
          <div className="space-y-2">
            {exchanges.map(ex => (
              <div key={ex.id} className="flex items-center justify-between gap-3 text-sm bg-gray-50 rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-gray-900 truncate">{ex.description}</p>
                  {ex.address && <p className="text-xs text-gray-400 truncate">{ex.address}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(ex.appraised_value)}</span>
                  <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', EXCHANGE_STATUS_COLORS[ex.status])}>
                    {EXCHANGE_STATUS_LABELS[ex.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documentos */}
      {documents.length > 0 && (
        <div>
          <hr className="border-gray-100 mb-4" />
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Documentos</h2>
          <div className="space-y-2">
            {documents.map(doc => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 text-sm"
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">{DOCUMENT_CATEGORY_LABELS[doc.category]}</p>
                </div>
                <Download className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Cronograma de obra */}
      {construction_stages.length > 0 && (
        <div>
          <hr className="border-gray-100 mb-4" />
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <HardHat className="w-4 h-4 text-gray-400" />
            Andamento da obra
          </h2>
          <div className="space-y-3">
            {construction_stages.map(stage => (
              <div key={stage.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">{stage.name}</p>
                  <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', CONSTRUCTION_STAGE_STATUS_COLORS[stage.status])}>
                    {CONSTRUCTION_STAGE_STATUS_LABELS[stage.status]}
                  </span>
                </div>
                {stage.description && <p className="text-xs text-gray-500 mt-1">{stage.description}</p>}
                {stage.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {stage.photos.map(photo => (
                      <div key={photo.id} className="w-16 h-16 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
