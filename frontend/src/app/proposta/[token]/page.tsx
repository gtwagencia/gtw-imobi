'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import type { PropertyProposal } from '@/types';
import { PROPERTY_TYPE_LABELS, PURPOSE_LABELS, formatCurrency, formatArea } from '@/lib/propertyConstants';
import { Loader2, Printer, Building2, CheckCircle2 } from 'lucide-react';

export default function PublicProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<PropertyProposal | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);

  const [signName,     setSignName]     = useState('');
  const [signDocument, setSignDocument] = useState('');
  const [signing,      setSigning]      = useState(false);
  const [signError,    setSignError]    = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<PropertyProposal>(`/proposals/${token}`);
        setProposal(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSign() {
    if (!signName.trim() || !signDocument.trim()) return;
    setSigning(true);
    setSignError('');
    try {
      const { data } = await api.post<PropertyProposal>(`/proposals/${token}/sign`, {
        name: signName.trim(),
        document: signDocument.trim(),
      });
      setProposal(data);
    } catch {
      setSignError('Não foi possível registrar a assinatura. Tente novamente.');
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">
        Proposta não encontrada ou expirada.
      </div>
    );
  }

  const { property, sale, workspace } = proposal.content;
  const address = [
    [property.street, property.number].filter(Boolean).join(', '),
    property.complement,
    property.neighborhood,
    [property.city, property.state].filter(Boolean).join(' - '),
  ].filter(Boolean).join(' · ');

  const features = [
    property.total_area ? formatArea(property.total_area) : null,
    property.bedrooms != null ? `${property.bedrooms} dorm.` : null,
    property.suites != null && property.suites > 0 ? `${property.suites} suíte(s)` : null,
    property.parking_spots != null ? `${property.parking_spots} vaga(s)` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            {workspace?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logo_url} alt="" className="h-10 w-auto" />
            )}
            <div>
              <h1 className="font-display text-lg font-semibold text-gray-900">
                {proposal.title || 'Proposta de compra'}
              </h1>
              {workspace?.name && <p className="text-sm text-gray-500">{workspace.name}</p>}
            </div>
          </div>
          <button className="btn-secondary text-sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>

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
            <div>
              <p className="font-semibold text-gray-900">{property.title}</p>
              <p className="text-xs text-gray-400">
                {property.code} · {PROPERTY_TYPE_LABELS[property.property_type]} · {PURPOSE_LABELS[property.purpose]}
              </p>
              {address && <p className="text-sm text-gray-500 mt-1">{address}</p>}
              {features && <p className="text-xs text-gray-400 mt-1">{features}</p>}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Dados da proposta */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Dados da proposta</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-gray-400">Proponente</span>
                <p className="font-medium text-gray-900">{proposal.buyer_name}</p>
              </div>
              {proposal.buyer_document && (
                <div>
                  <span className="text-xs text-gray-400">CPF/CNPJ</span>
                  <p className="font-medium text-gray-900">{proposal.buyer_document}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-400">Valor proposto</span>
                <p className="font-semibold text-brand-700 text-lg">{formatCurrency(proposal.proposed_price)}</p>
              </div>
              {proposal.validity_date && (
                <div>
                  <span className="text-xs text-gray-400">Validade da proposta</span>
                  <p className="font-medium text-gray-900">{new Date(proposal.validity_date).toLocaleDateString('pt-BR')}</p>
                </div>
              )}
            </div>

            {proposal.payment_conditions && (
              <div className="mt-3">
                <span className="text-xs text-gray-400">Condições de pagamento</span>
                <p className="text-sm text-gray-700 whitespace-pre-line">{proposal.payment_conditions}</p>
              </div>
            )}

            {sale && (
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

          <hr className="border-gray-100" />

          {/* Assinatura */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Assinatura eletrônica</h2>

            {proposal.status === 'assinada' ? (
              <div className="flex items-start gap-2 bg-green-50 text-green-700 rounded-lg p-3 text-sm">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Proposta assinada por {proposal.signature_name}</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Documento {proposal.signature_document}
                    {proposal.signed_at ? ` · ${new Date(proposal.signed_at).toLocaleString('pt-BR')}` : ''}
                  </p>
                </div>
              </div>
            ) : proposal.status === 'cancelada' ? (
              <p className="text-sm text-gray-400 italic">Esta proposta foi cancelada e não pode mais ser assinada.</p>
            ) : (
              <div className="space-y-2 print:hidden">
                <p className="text-xs text-gray-400 mb-2">
                  Ao informar seu nome completo e CPF/CNPJ abaixo, você confirma a leitura e concordância com os termos desta proposta.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className="input text-sm" placeholder="Nome completo" value={signName} onChange={(e) => setSignName(e.target.value)} />
                  <input className="input text-sm" placeholder="CPF/CNPJ" value={signDocument} onChange={(e) => setSignDocument(e.target.value)} />
                </div>
                {signError && <p className="text-xs text-red-500">{signError}</p>}
                <button className="btn-primary text-sm" disabled={signing || !signName.trim() || !signDocument.trim()} onClick={handleSign}>
                  {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {signing ? 'Registrando...' : 'Assinar proposta'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
