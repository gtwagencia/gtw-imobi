'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { CommissionStatus, Contact, PartnerBroker, PropertySale } from '@/types';
import { COMMISSION_STATUS_LABELS, formatCurrency } from '@/lib/propertyConstants';
import { Loader2, Save, Trash2 } from 'lucide-react';
import PropertyExchangesPanel from './PropertyExchangesPanel';

interface SaleConditionsPanelProps {
  workspaceId: string;
  propertyId: string;
  purpose: string;
}

export default function SaleConditionsPanel({ workspaceId, propertyId, purpose }: SaleConditionsPanelProps) {
  const [sale,     setSale]     = useState<PropertySale | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [partnerBrokers, setPartnerBrokers] = useState<PartnerBroker[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const [buyerName,         setBuyerName]         = useState('');
  const [buyerId,           setBuyerId]           = useState('');
  const [salePrice,         setSalePrice]         = useState('');
  const [downPayment,       setDownPayment]       = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('');
  const [installmentValue,  setInstallmentValue]  = useState('');
  const [financingValue,    setFinancingValue]    = useState('');
  const [saleDate,          setSaleDate]          = useState('');
  const [notes,             setNotes]             = useState('');

  const [commissionPctOverride, setCommissionPctOverride] = useState('');
  const [partnerBrokerName,     setPartnerBrokerName]     = useState('');
  const [partnerCommissionPct,  setPartnerCommissionPct]  = useState('');
  const [commissionStatus,      setCommissionStatus]      = useState<CommissionStatus>('pendente');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [saleRes, contactsRes, brokersRes] = await Promise.all([
          api.get<PropertySale | null>(`/workspaces/${workspaceId}/properties/${propertyId}/sale`),
          api.get<{ data: Contact[] }>(`/workspaces/${workspaceId}/contacts`, { params: { limit: 200 } }),
          api.get<PartnerBroker[]>(`/workspaces/${workspaceId}/partner-brokers`),
        ]);
        setContacts(contactsRes.data.data || []);
        setPartnerBrokers(brokersRes.data || []);
        if (saleRes.data) {
          const s = saleRes.data;
          setSale(s);
          setBuyerId(s.buyer_id || '');
          setBuyerName(s.buyer_name || '');
          setSalePrice(String(s.sale_price ?? ''));
          setDownPayment(s.down_payment != null ? String(s.down_payment) : '');
          setInstallmentsCount(s.installments_count != null ? String(s.installments_count) : '');
          setInstallmentValue(s.installment_value != null ? String(s.installment_value) : '');
          setFinancingValue(s.financing_value != null ? String(s.financing_value) : '');
          setSaleDate(s.sale_date ? s.sale_date.slice(0, 10) : '');
          setNotes(s.notes || '');
          setCommissionPctOverride(s.commission_pct != null ? String(s.commission_pct) : '');
          setPartnerBrokerName(s.partner_broker_name || '');
          setPartnerCommissionPct(s.partner_commission_pct != null ? String(s.partner_commission_pct) : '');
          setCommissionStatus(s.commission_status || 'pendente');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, propertyId]);

  async function handleSave() {
    if (!salePrice) return;
    setSaving(true);
    try {
      const matchedBuyer = contacts.find(c => c.name === buyerName);
      const matchedBroker = partnerBrokers.find(b => b.name === partnerBrokerName);
      const { data } = await api.put<PropertySale>(`/workspaces/${workspaceId}/properties/${propertyId}/sale`, {
        buyerId:           matchedBuyer?.id || null,
        salePrice:         Number(salePrice),
        downPayment:       downPayment ? Number(downPayment) : null,
        installmentsCount: installmentsCount ? parseInt(installmentsCount, 10) : null,
        installmentValue:  installmentValue ? Number(installmentValue) : null,
        financingValue:    financingValue ? Number(financingValue) : null,
        saleDate:          saleDate || null,
        notes:             notes || null,
        commissionPct:        commissionPctOverride ? Number(commissionPctOverride) : undefined,
        partnerBrokerId:      matchedBroker?.id || null,
        partnerCommissionPct: matchedBroker ? Number(partnerCommissionPct || 0) : undefined,
        commissionStatus,
      });
      setSale(data);
      setBuyerId(data.buyer_id || '');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Remover as condições de venda? O imóvel voltará para "Disponível".')) return;
    await api.delete(`/workspaces/${workspaceId}/properties/${propertyId}/sale`);
    setSale(null);
    setBuyerId(''); setBuyerName(''); setSalePrice(''); setDownPayment('');
    setInstallmentsCount(''); setInstallmentValue(''); setFinancingValue('');
    setSaleDate(''); setNotes('');
    setCommissionPctOverride(''); setPartnerBrokerName(''); setPartnerCommissionPct(''); setCommissionStatus('pendente');
  }

  const label = purpose === 'locacao' ? 'locação' : 'venda';

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Condições de {label}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Registre o comprador, valor negociado e plano de pagamento desta unidade</p>
        </div>
        {sale && (
          <button className="btn-ghost text-sm text-red-500 hover:bg-red-50" onClick={handleRemove}>
            <Trash2 className="w-4 h-4" />
            Remover
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comprador</label>
              <input
                list="sale-buyers-list"
                className="input text-sm"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Buscar contato..."
              />
              <datalist id="sale-buyers-list">
                {contacts.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data da {label}</label>
              <input className="input text-sm" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor negociado *</label>
              <input className="input text-sm" type="number" min="0" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="R$" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entrada</label>
              <input className="input text-sm" type="number" min="0" step="0.01" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} placeholder="R$" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Parcelas</label>
              <input className="input text-sm" type="number" min="0" value={installmentsCount} onChange={(e) => setInstallmentsCount(e.target.value)} placeholder="Qtd." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor da parcela</label>
              <input className="input text-sm" type="number" min="0" step="0.01" value={installmentValue} onChange={(e) => setInstallmentValue(e.target.value)} placeholder="R$" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor financiado</label>
              <input className="input text-sm" type="number" min="0" step="0.01" value={financingValue} onChange={(e) => setFinancingValue(e.target.value)} placeholder="R$" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
              <input className="input text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condições adicionais..." />
            </div>
          </div>

          {sale && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              Total financiado/parcelado: {formatCurrency((Number(installmentsCount) || 0) * (Number(installmentValue) || 0) + (Number(financingValue) || 0))}
            </div>
          )}

          {/* Permutas */}
          {sale && (
            <PropertyExchangesPanel workspaceId={workspaceId} propertyId={propertyId} salePrice={sale.sale_price} />
          )}

          {/* Comissão */}
          <div className="border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Comissão</h4>
            <p className="text-xs text-gray-400 mb-3">
              O percentual de comissão segue a configuração do empreendimento/workspace, com a opção de override por venda.
              Caso haja corretor parceiro, a comissão é dividida automaticamente.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">% de comissão (override)</label>
                <input
                  className="input text-sm"
                  type="number" min="0" max="100" step="0.01"
                  value={commissionPctOverride}
                  onChange={(e) => setCommissionPctOverride(e.target.value)}
                  placeholder="Padrão do workspace/empreendimento"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Corretor parceiro</label>
                <input
                  list="sale-partner-brokers-list"
                  className="input text-sm"
                  value={partnerBrokerName}
                  onChange={(e) => setPartnerBrokerName(e.target.value)}
                  placeholder="Buscar corretor parceiro..."
                />
                <datalist id="sale-partner-brokers-list">
                  {partnerBrokers.map(b => <option key={b.id} value={b.name} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">% do corretor parceiro</label>
                <input
                  className="input text-sm"
                  type="number" min="0" max="100" step="0.01"
                  value={partnerCommissionPct}
                  onChange={(e) => setPartnerCommissionPct(e.target.value)}
                  placeholder="% sobre a comissão"
                  disabled={!partnerBrokerName.trim()}
                />
              </div>
            </div>

            <div className="mt-3 max-w-xs">
              <label className="block text-xs font-medium text-gray-600 mb-1">Status da comissão</label>
              <select className="input text-sm" value={commissionStatus} onChange={(e) => setCommissionStatus(e.target.value as CommissionStatus)}>
                {Object.entries(COMMISSION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {sale && sale.commission_value != null && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs bg-gray-50 rounded-lg p-3">
                <div>
                  <span className="text-gray-400">Comissão total ({sale.commission_pct}%)</span>
                  <p className="font-semibold text-gray-900">{formatCurrency(sale.commission_value)}</p>
                </div>
                {sale.partner_broker_id && (
                  <div>
                    <span className="text-gray-400">Corretor parceiro{sale.partner_broker_name ? ` (${sale.partner_broker_name})` : ''}</span>
                    <p className="font-semibold text-gray-900">{formatCurrency(sale.partner_commission_value)}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-400">Imobiliária</span>
                  <p className="font-semibold text-gray-900">{formatCurrency(sale.broker_commission_value)}</p>
                </div>
              </div>
            )}
          </div>

          <button className="btn-primary text-sm" disabled={saving || !salePrice} onClick={handleSave}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar condições'}
          </button>
        </div>
      )}
    </div>
  );
}
