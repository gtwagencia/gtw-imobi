'use client';

import { useState } from 'react';
import { X, Loader2, Check, User, DollarSign, Building2 } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/store/toast';
import type { MapUnit } from './DevelopmentMap';
import { formatCurrency } from '@/lib/propertyConstants';
import clsx from 'clsx';

interface Props {
  unit: MapUnit;
  developmentId: string;
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PAYMENT_TYPES = [
  { value: 'financiamento',          label: 'Financiamento Bancário' },
  { value: 'vista',                  label: 'À Vista' },
  { value: 'fgts',                   label: 'FGTS + Financiamento' },
  { value: 'parcelado_construtora',  label: 'Parcelado com a Construtora' },
];

export default function ProposalModal({ unit, developmentId, workspaceId, onClose, onSuccess }: Props) {
  const showToast = useToast(s => s.show);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    partnerAgency:  '',
    partnerBroker:  '',
    buyerName:      '',
    buyerCpf:       '',
    buyerEmail:     '',
    buyerPhone:     '',
    proposedPrice:  unit.sale_price ? String(unit.sale_price) : '',
    paymentType:    'financiamento',
    downPayment:    '',
    installments:   '',
    financingBank:  '',
    notes:          '',
    expiresHours:   '72',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const expiresAt = form.expiresHours
        ? new Date(Date.now() + parseInt(form.expiresHours) * 3600000).toISOString()
        : undefined;

      await api.post(`/workspaces/${workspaceId}/developments/${developmentId}/proposals`, {
        propertyId:     unit.id,
        partnerAgency:  form.partnerAgency  || undefined,
        partnerBroker:  form.partnerBroker  || undefined,
        buyerName:      form.buyerName,
        buyerCpf:       form.buyerCpf       || undefined,
        buyerEmail:     form.buyerEmail      || undefined,
        buyerPhone:     form.buyerPhone      || undefined,
        proposedPrice:  parseFloat(form.proposedPrice),
        paymentType:    form.paymentType,
        downPayment:    form.downPayment     ? parseFloat(form.downPayment)    : undefined,
        installments:   form.installments    ? parseInt(form.installments)     : undefined,
        financingBank:  form.financingBank   || undefined,
        notes:          form.notes           || undefined,
        expiresAt,
      });
      showToast('Proposta enviada com sucesso!');
      onSuccess();
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao enviar proposta', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Nova Proposta</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {unit.title} — {unit.block_label && `Quadra ${unit.block_label} `}{unit.lot_label && `Lote ${unit.lot_label}`}{unit.unit_number && `Unidade ${unit.unit_number}`}
              {unit.total_area && ` · ${unit.total_area} m²`}
              {unit.sale_price && ` · Tabela: ${formatCurrency(unit.sale_price)}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Imobiliária / Corretor */}
          <fieldset>
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Imobiliária Parceira
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Imobiliária</label>
                <input className="input" placeholder="Nome da imobiliária" value={form.partnerAgency} onChange={e => set('partnerAgency', e.target.value)} />
              </div>
              <div>
                <label className="label">Corretor</label>
                <input className="input" placeholder="Nome do corretor" value={form.partnerBroker} onChange={e => set('partnerBroker', e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* Comprador */}
          <fieldset>
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Dados do Comprador
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Nome completo <span className="text-red-500">*</span></label>
                <input className="input" placeholder="Nome do comprador" value={form.buyerName} onChange={e => set('buyerName', e.target.value)} required />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input" placeholder="000.000.000-00" value={form.buyerCpf} onChange={e => set('buyerCpf', e.target.value)} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" placeholder="(00) 00000-0000" value={form.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label">E-mail</label>
                <input className="input" type="email" placeholder="comprador@email.com" value={form.buyerEmail} onChange={e => set('buyerEmail', e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* Condições */}
          <fieldset>
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Condições da Proposta
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Preço proposto <span className="text-red-500">*</span></label>
                <input className="input" type="number" placeholder="0,00" step="0.01" min="0" value={form.proposedPrice} onChange={e => set('proposedPrice', e.target.value)} required />
              </div>
              <div className="col-span-2">
                <label className="label">Forma de pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_TYPES.map(pt => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => set('paymentType', pt.value)}
                      className={clsx(
                        'text-left px-3 py-2 rounded-lg border-2 text-sm transition-all',
                        form.paymentType === pt.value
                          ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.paymentType !== 'vista' && (
                <>
                  <div>
                    <label className="label">Entrada</label>
                    <input className="input" type="number" placeholder="R$ 0,00" step="0.01" min="0" value={form.downPayment} onChange={e => set('downPayment', e.target.value)} />
                  </div>
                  {form.paymentType === 'parcelado_construtora' && (
                    <div>
                      <label className="label">Parcelas</label>
                      <input className="input" type="number" placeholder="Ex: 120" min="1" value={form.installments} onChange={e => set('installments', e.target.value)} />
                    </div>
                  )}
                  {(form.paymentType === 'financiamento' || form.paymentType === 'fgts') && (
                    <div>
                      <label className="label">Banco / Financeira</label>
                      <input className="input" placeholder="Ex: Caixa, Itaú" value={form.financingBank} onChange={e => set('financingBank', e.target.value)} />
                    </div>
                  )}
                </>
              )}

              <div className="col-span-2">
                <label className="label">Validade da proposta</label>
                <select className="input" value={form.expiresHours} onChange={e => set('expiresHours', e.target.value)}>
                  <option value="24">24 horas</option>
                  <option value="48">48 horas</option>
                  <option value="72">72 horas (padrão)</option>
                  <option value="120">5 dias</option>
                  <option value="168">7 dias</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={3} placeholder="Informações adicionais, condições especiais..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </fieldset>
        </form>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSubmit} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Enviar proposta
          </button>
        </div>
      </div>
    </div>
  );
}
