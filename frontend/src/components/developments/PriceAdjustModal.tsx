'use client';

import { useState } from 'react';
import { X, Loader2, TrendingUp, DollarSign, Percent, Check } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/store/toast';
import clsx from 'clsx';

interface PriceZone { id: string; name: string; color: string; modifier_type: string; modifier_value: number; units_count: number }

interface Props {
  developmentId: string;
  workspaceId: string;
  zones: PriceZone[];
  blocks: string[];
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = 'per_m2' | 'percent' | 'fixed';

const MODES: { value: Mode; label: string; desc: string; icon: React.ElementType; placeholder: string }[] = [
  { value: 'per_m2',   label: 'Valor por m²',      desc: 'Preço = Área × R$/m²',               icon: TrendingUp,  placeholder: 'Ex: 950' },
  { value: 'percent',  label: 'Ajuste percentual',  desc: '+10 aumenta 10%, -5 desconta 5%',     icon: Percent,     placeholder: 'Ex: 10 ou -5' },
  { value: 'fixed',    label: 'Preço fixo',         desc: 'Define o mesmo preço para todas',     icon: DollarSign,  placeholder: 'Ex: 350000' },
];

export default function PriceAdjustModal({ developmentId, workspaceId, zones, blocks, onClose, onSuccess }: Props) {
  const showToast = useToast(s => s.show);
  const [mode,        setMode]        = useState<Mode>('per_m2');
  const [value,       setValue]       = useState('');
  const [zoneFilter,  setZoneFilter]  = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [saving,      setSaving]      = useState(false);

  async function handleApply() {
    if (!value) { showToast('Informe o valor', 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post(
        `/workspaces/${workspaceId}/developments/${developmentId}/units/price-adjust`,
        { mode, value: parseFloat(value), zoneFilter: zoneFilter || undefined, blockFilter: blockFilter || undefined }
      );
      showToast(`${data.updated} unidades atualizadas`);
      onSuccess();
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao ajustar preços', 'error');
    } finally {
      setSaving(false);
    }
  }

  const activeModes = MODES.find(m => m.value === mode)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Ajuste de Preços em Massa</h2>
            <p className="text-xs text-gray-400 mt-0.5">Atualiza automaticamente o preço das unidades selecionadas</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Modo */}
          <div>
            <label className="label">Tipo de ajuste</label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all',
                      mode === m.value ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">{activeModes.desc}</p>
          </div>

          {/* Valor */}
          <div>
            <label className="label">
              Valor {mode === 'per_m2' ? '(R$/m²)' : mode === 'percent' ? '(%)' : '(R$)'}
              <span className="text-red-500"> *</span>
            </label>
            <input
              className="input text-lg font-bold"
              type="number"
              step={mode === 'percent' ? '0.1' : '1'}
              placeholder={activeModes.placeholder}
              value={value}
              onChange={e => setValue(e.target.value)}
            />
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Filtrar por zona</label>
              <select className="input" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
                <option value="">Todas as zonas</option>
                {zones.map(z => (
                  <option key={z.id} value={z.name}>{z.name} ({z.units_count} un.)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Filtrar por quadra</label>
              <select className="input" value={blockFilter} onChange={e => setBlockFilter(e.target.value)}>
                <option value="">Todas as quadras</option>
                {blocks.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* Aviso */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            <strong>Atenção:</strong> Esta operação atualizará os preços de todas as unidades{' '}
            {zoneFilter ? `da zona "${zoneFilter}"` : ''}{zoneFilter && blockFilter ? ' e ' : ''}{blockFilter ? `da quadra "${blockFilter}"` : ''}{' '}
            que tenham status <strong>disponível ou reservado</strong>. Ação irreversível.
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleApply} className="btn-primary" disabled={saving || !value}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Aplicar ajuste
          </button>
        </div>
      </div>
    </div>
  );
}
