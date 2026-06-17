'use client';

import { useState } from 'react';
import { X, Loader2, Check, DollarSign, Ruler, MapPin } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/store/toast';
import type { MapUnit } from './DevelopmentMap';
import clsx from 'clsx';

interface PriceZone { id: string; name: string; color: string }

interface Props {
  unit: MapUnit;
  developmentId: string;
  workspaceId: string;
  zones: PriceZone[];
  onClose: () => void;
  onSaved: (updated: Partial<MapUnit>) => void;
}

const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível',  color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'reservado',  label: 'Reservado',   color: 'bg-amber-100 text-amber-700 border-amber-300'  },
  { value: 'vendido',    label: 'Vendido',     color: 'bg-red-100 text-red-600 border-red-300'        },
  { value: 'bloqueado',  label: 'Bloqueado',   color: 'bg-violet-100 text-violet-700 border-violet-300'},
  { value: 'inativo',    label: 'Inativo',     color: 'bg-gray-100 text-gray-500 border-gray-200'     },
];

export default function UnitEditModal({ unit, developmentId, workspaceId, zones, onClose, onSaved }: Props) {
  const showToast = useToast(s => s.show);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status:      unit.status,
    salePrice:   unit.sale_price != null ? String(unit.sale_price) : '',
    priceZone:   unit.price_zone || '',
    blockLabel:  unit.block_label || '',
    lotLabel:    unit.lot_label || '',
    unitFloor:   unit.unit_floor != null ? String(unit.unit_floor) : '',
    unitNumber:  unit.unit_number || '',
    totalArea:   unit.total_area != null ? String(unit.total_area) : '',
    areaFront:   unit.area_front  != null ? String(unit.area_front)  : '',
    areaDepth:   unit.area_depth  != null ? String(unit.area_depth)  : '',
    areaLeft:    unit.area_left   != null ? String(unit.area_left)   : '',
    areaRight:   unit.area_right  != null ? String(unit.area_right)  : '',
    notes:       unit.notes || '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status:     form.status,
        salePrice:  form.salePrice   ? parseFloat(form.salePrice)  : null,
        priceZone:  form.priceZone   || null,
        blockLabel: form.blockLabel  || null,
        lotLabel:   form.lotLabel    || null,
        unitFloor:  form.unitFloor   ? parseInt(form.unitFloor)    : null,
        unitNumber: form.unitNumber  || null,
        totalArea:  form.totalArea   ? parseFloat(form.totalArea)  : null,
        areaFront:  form.areaFront   ? parseFloat(form.areaFront)  : null,
        areaDepth:  form.areaDepth   ? parseFloat(form.areaDepth)  : null,
        areaLeft:   form.areaLeft    ? parseFloat(form.areaLeft)   : null,
        areaRight:  form.areaRight   ? parseFloat(form.areaRight)  : null,
        notes:      form.notes       || null,
      };
      await api.put(`/workspaces/${workspaceId}/developments/${developmentId}/units/${unit.id}`, payload);
      showToast('Unidade atualizada');
      onSaved({
        status:      form.status as MapUnit['status'],
        sale_price:  form.salePrice ? parseFloat(form.salePrice) : null,
        price_zone:  form.priceZone || null,
        block_label: form.blockLabel || null,
        lot_label:   form.lotLabel || null,
        unit_floor:  form.unitFloor ? parseInt(form.unitFloor) : null,
        unit_number: form.unitNumber || null,
        total_area:  form.totalArea ? parseFloat(form.totalArea) : null,
      });
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Editar Unidade</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{unit.code} · {unit.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Status */}
          <div>
            <label className="label">Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('status', s.value)}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all',
                    form.status === s.value ? s.color + ' border-opacity-100' : 'border-transparent bg-gray-100 text-gray-500'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Localização */}
          <fieldset>
            <legend className="label flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Localização</legend>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Quadra / Bloco</label>
                <input className="input" placeholder="Ex: A" value={form.blockLabel} onChange={e => set('blockLabel', e.target.value)} />
              </div>
              <div>
                <label className="label">Lote</label>
                <input className="input" placeholder="Ex: 01" value={form.lotLabel} onChange={e => set('lotLabel', e.target.value)} />
              </div>
              <div>
                <label className="label">Nº / Unid.</label>
                <input className="input" placeholder="Ex: 101" value={form.unitNumber} onChange={e => set('unitNumber', e.target.value)} />
              </div>
              <div>
                <label className="label">Andar</label>
                <input className="input" type="number" min="0" placeholder="—" value={form.unitFloor} onChange={e => set('unitFloor', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label">Zona de preço</label>
                <select className="input" value={form.priceZone} onChange={e => set('priceZone', e.target.value)}>
                  <option value="">Sem zona</option>
                  {zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          {/* Metragem */}
          <fieldset>
            <legend className="label flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5" /> Metragem</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <label className="label">Área total (m²)</label>
                <input className="input" type="number" step="0.01" placeholder="Ex: 360" value={form.totalArea} onChange={e => set('totalArea', e.target.value)} />
              </div>
              <div>
                <label className="label">Frente (m)</label>
                <input className="input" type="number" step="0.01" placeholder="—" value={form.areaFront} onChange={e => set('areaFront', e.target.value)} />
              </div>
              <div>
                <label className="label">Fundo (m)</label>
                <input className="input" type="number" step="0.01" placeholder="—" value={form.areaDepth} onChange={e => set('areaDepth', e.target.value)} />
              </div>
              <div>
                <label className="label">Lat. Esq. (m)</label>
                <input className="input" type="number" step="0.01" placeholder="—" value={form.areaLeft} onChange={e => set('areaLeft', e.target.value)} />
              </div>
              <div>
                <label className="label">Lat. Dir. (m)</label>
                <input className="input" type="number" step="0.01" placeholder="—" value={form.areaRight} onChange={e => set('areaRight', e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* Preço */}
          <fieldset>
            <legend className="label flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Preço</legend>
            <div>
              <label className="label">Preço de venda (R$)</label>
              <input className="input text-lg font-bold" type="number" step="0.01" min="0" placeholder="0,00" value={form.salePrice} onChange={e => set('salePrice', e.target.value)} />
            </div>
          </fieldset>

          {/* Notas */}
          <div>
            <label className="label">Observações internas</label>
            <textarea className="input resize-none" rows={2} placeholder="Anotações sobre a unidade..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </form>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
