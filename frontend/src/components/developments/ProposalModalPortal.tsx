'use client';

import { useState } from 'react';
import { X, Loader2, Check, User, DollarSign, Building2 } from 'lucide-react';
import type { MapUnit } from './DevelopmentMap';
import { formatCurrency } from '@/lib/propertyConstants';
import clsx from 'clsx';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/$/, '');

interface Props {
  unit: MapUnit;
  developmentId: string;
  brokerToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PAYMENT_TYPES = [
  { value: 'financiamento',         label: 'Financiamento Bancário' },
  { value: 'vista',                 label: 'À Vista' },
  { value: 'fgts',                  label: 'FGTS + Financiamento' },
  { value: 'parcelado_construtora', label: 'Parcelado com a Construtora' },
];

export default function ProposalModalPortal({ unit, developmentId, brokerToken, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [form, setForm] = useState({
    buyerName:     '',
    buyerCpf:      '',
    buyerEmail:    '',
    buyerPhone:    '',
    proposedPrice: unit.sale_price ? String(unit.sale_price) : '',
    paymentType:   'financiamento',
    downPayment:   '',
    installments:  '',
    financingBank: '',
    notes:         '',
    expiresHours:  '72',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.buyerName.trim()) { setError('Nome do comprador é obrigatório'); return; }
    if (!form.proposedPrice)    { setError('Informe o preço proposto');         return; }
    setSaving(true); setError('');
    try {
      const expiresAt = new Date(Date.now() + parseInt(form.expiresHours) * 3600000).toISOString();
      const res = await fetch(`${API}/partner-portal/broker/${brokerToken}/developments/${developmentId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId:    unit.id,
          buyerName:     form.buyerName,
          buyerCpf:      form.buyerCpf      || undefined,
          buyerEmail:    form.buyerEmail    || undefined,
          buyerPhone:    form.buyerPhone    || undefined,
          proposedPrice: parseFloat(form.proposedPrice),
          paymentType:   form.paymentType,
          downPayment:   form.downPayment   ? parseFloat(form.downPayment)  : undefined,
          installments:  form.installments  ? parseInt(form.installments)   : undefined,
          financingBank: form.financingBank || undefined,
          notes:         form.notes         || undefined,
          expiresAt,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || 'Erro ao enviar proposta');
      }
      onSuccess();
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao enviar proposta');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Enviar Proposta</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {unit.block_label && `Quadra ${unit.block_label} `}
              {unit.lot_label && `Lote ${unit.lot_label}`}
              {unit.unit_number && `Unidade ${unit.unit_number}`}
              {unit.total_area && ` · ${unit.total_area} m²`}
              {unit.sale_price && ` · Tabela: ${formatCurrency(unit.sale_price)}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">{error}</div>
          )}

          {/* Comprador */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              <User className="w-3.5 h-3.5" /> Dados do comprador
            </div>
            <div className="space-y-2">
              <div>
                <label className="label">Nome completo <span className="text-red-500">*</span></label>
                <input className="input" placeholder="Nome do comprador" value={form.buyerName} onChange={e => set('buyerName', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">CPF</label>
                  <input className="input" placeholder="000.000.000-00" value={form.buyerCpf} onChange={e => set('buyerCpf', e.target.value)} />
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <input className="input" placeholder="(00) 00000-0000" value={form.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">E-mail</label>
                <input className="input" type="email" placeholder="comprador@email.com" value={form.buyerEmail} onChange={e => set('buyerEmail', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Condições */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              <DollarSign className="w-3.5 h-3.5" /> Condições
            </div>
            <div className="space-y-2">
              <div>
                <label className="label">Preço proposto (R$) <span className="text-red-500">*</span></label>
                <input className="input font-bold text-lg" type="number" step="0.01" min="0" placeholder="0,00" value={form.proposedPrice} onChange={e => set('proposedPrice', e.target.value)} required />
              </div>
              <div>
                <label className="label">Forma de pagamento</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAYMENT_TYPES.map(pt => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => set('paymentType', pt.value)}
                      className={clsx(
                        'text-left px-2.5 py-2 rounded-lg border-2 text-xs transition-all',
                        form.paymentType === pt.value
                          ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold'
                          : 'border-gray-200 text-gray-600'
                      )}
                    >{pt.label}</button>
                  ))}
                </div>
              </div>
              {form.paymentType !== 'vista' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Entrada (R$)</label>
                    <input className="input" type="number" step="0.01" placeholder="—" value={form.downPayment} onChange={e => set('downPayment', e.target.value)} />
                  </div>
                  {form.paymentType === 'parcelado_construtora' && (
                    <div>
                      <label className="label">Parcelas</label>
                      <input className="input" type="number" placeholder="Ex: 120" value={form.installments} onChange={e => set('installments', e.target.value)} />
                    </div>
                  )}
                  {(form.paymentType === 'financiamento' || form.paymentType === 'fgts') && (
                    <div>
                      <label className="label">Banco</label>
                      <input className="input" placeholder="Ex: Caixa" value={form.financingBank} onChange={e => set('financingBank', e.target.value)} />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="label">Validade da proposta</label>
                <select className="input" value={form.expiresHours} onChange={e => set('expiresHours', e.target.value)}>
                  <option value="24">24 horas</option>
                  <option value="48">48 horas</option>
                  <option value="72">72 horas</option>
                  <option value="120">5 dias</option>
                </select>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={2} placeholder="Condições especiais, anotações..." value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-xl p-2.5 flex gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
            A proposta ficará reservada pelo prazo selecionado. A incorporadora irá analisar e aprovar ou solicitar ajustes.
          </div>
        </form>

        <div className="flex gap-2 p-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSubmit} className="btn-primary flex-1" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Enviar proposta
          </button>
        </div>
      </div>
    </div>
  );
}
