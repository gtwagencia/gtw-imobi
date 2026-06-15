'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { PropertyExchange, PropertyExchangeStatus } from '@/types';
import { EXCHANGE_STATUS_LABELS, EXCHANGE_STATUS_COLORS, formatCurrency } from '@/lib/propertyConstants';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface PropertyExchangesPanelProps {
  workspaceId: string;
  propertyId: string;
  salePrice: number;
}

const STATUS_OPTIONS: PropertyExchangeStatus[] = ['pendente', 'aceita', 'recebida', 'revendida'];

export default function PropertyExchangesPanel({ workspaceId, propertyId, salePrice }: PropertyExchangesPanelProps) {
  const [exchanges, setExchanges] = useState<PropertyExchange[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  const [description,    setDescription]    = useState('');
  const [propertyType,   setPropertyType]   = useState('');
  const [address,        setAddress]        = useState('');
  const [appraisedValue, setAppraisedValue] = useState('');
  const [notes,          setNotes]          = useState('');

  const base = `/workspaces/${workspaceId}/properties/${propertyId}/sale/exchanges`;

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<PropertyExchange[]>(base);
      setExchanges(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, propertyId]);

  async function handleCreate() {
    if (!description.trim() || !appraisedValue) return;
    setCreating(true);
    try {
      const { data } = await api.post<PropertyExchange>(base, {
        description:    description.trim(),
        propertyType:   propertyType.trim() || null,
        address:        address.trim() || null,
        appraisedValue: Number(appraisedValue),
        notes:          notes.trim() || null,
      });
      setExchanges(prev => [...prev, data]);
      setDescription(''); setPropertyType(''); setAddress(''); setAppraisedValue(''); setNotes('');
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateStatus(id: string, status: PropertyExchangeStatus) {
    const { data } = await api.put<PropertyExchange>(`${base}/${id}`, { status });
    setExchanges(prev => prev.map(ex => ex.id === id ? data : ex));
  }

  async function handleRemove(id: string) {
    if (!confirm('Remover esta permuta?')) return;
    await api.delete(`${base}/${id}`);
    setExchanges(prev => prev.filter(ex => ex.id !== id));
  }

  const totalExchanged = exchanges.reduce((sum, ex) => sum + Number(ex.appraised_value), 0);
  const remainingCash  = salePrice - totalExchanged;

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-gray-900">Permutas</h4>
        <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-3.5 h-3.5" />
          Adicionar imóvel em permuta
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Imóveis recebidos do comprador como parte do pagamento desta unidade.
      </p>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Descrição do imóvel (ex: Casa Rua X, 123)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input className="input text-sm" placeholder="Tipo (ex: Casa, Terreno...)" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
            <input className="input text-sm" type="number" min="0" step="0.01" placeholder="Valor de avaliação (R$)" value={appraisedValue} onChange={(e) => setAppraisedValue(e.target.value)} />
          </div>
          <input className="input text-sm" placeholder="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-xs" disabled={creating || !description.trim() || !appraisedValue} onClick={handleCreate}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Adicionar
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-4 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : exchanges.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Nenhum imóvel recebido em permuta nesta venda.</p>
      ) : (
        <div className="space-y-2">
          {exchanges.map(ex => (
            <div key={ex.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{ex.description}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[ex.property_type, ex.address].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(ex.appraised_value)}</p>
              <select
                className={clsx('input text-xs w-auto border-0 py-1', EXCHANGE_STATUS_COLORS[ex.status])}
                value={ex.status}
                onChange={(e) => handleUpdateStatus(ex.id, e.target.value as PropertyExchangeStatus)}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{EXCHANGE_STATUS_LABELS[s]}</option>)}
              </select>
              <button type="button" className="btn-ghost text-sm text-red-500 hover:bg-red-50 p-1" onClick={() => handleRemove(ex.id)} title="Remover permuta">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 flex flex-wrap gap-4">
            <span>Total em permutas: <strong className="text-gray-900">{formatCurrency(totalExchanged)}</strong></span>
            <span>Saldo em dinheiro: <strong className="text-gray-900">{formatCurrency(remainingCash)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
