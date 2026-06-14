'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import type { Development, DevelopmentConstructionStatus } from '@/types';
import { CONSTRUCTION_STATUS_LABELS, AMENITIES_LIST, BRAZIL_STATES } from '@/lib/propertyConstants';
import LocationPicker from './LocationPicker';
import { Plus, X } from 'lucide-react';

interface DevelopmentFormProps {
  development?: Development;
  workspaceId: string;
  onSave: (d: Development) => void;
}

interface FormState {
  name: string;
  description: string;
  builderName: string;
  constructionStatus: DevelopmentConstructionStatus;
  deliveryDate: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
  amenities: string[];
  isFeatured: boolean;
}

function toFormState(d?: Development): FormState {
  return {
    name:               d?.name || '',
    description:        d?.description || '',
    builderName:        d?.builder_name || '',
    constructionStatus: d?.construction_status || 'em_obras',
    deliveryDate:       d?.delivery_date ? d.delivery_date.slice(0, 10) : '',
    zipCode:            d?.zip_code || '',
    street:             d?.street || '',
    number:             d?.number || '',
    complement:         d?.complement || '',
    neighborhood:       d?.neighborhood || '',
    city:               d?.city || '',
    state:              d?.state || '',
    latitude:           d?.latitude  != null ? String(d.latitude)  : '',
    longitude:          d?.longitude != null ? String(d.longitude) : '',
    amenities:          d?.amenities || [],
    isFeatured:         d?.is_featured || false,
  };
}

export default function DevelopmentForm({ development, workspaceId, onSave }: DevelopmentFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(development));
  const [customAmenity, setCustomAmenity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => { setForm(toFormState(development)); }, [development]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleAmenity(amenity: string) {
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }

  function addCustomAmenity() {
    const val = customAmenity.trim();
    if (!val || form.amenities.includes(val)) { setCustomAmenity(''); return; }
    setForm(prev => ({ ...prev, amenities: [...prev.amenities, val] }));
    setCustomAmenity('');
  }

  function removeAmenity(amenity: string) {
    setForm(prev => ({ ...prev, amenities: prev.amenities.filter(a => a !== amenity) }));
  }

  const customAmenities = form.amenities.filter(a => !AMENITIES_LIST.includes(a));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name:               form.name.trim(),
        description:        form.description.trim() || null,
        builderName:        form.builderName.trim() || null,
        constructionStatus: form.constructionStatus,
        deliveryDate:       form.deliveryDate || null,
        zipCode:            form.zipCode.trim() || null,
        street:             form.street.trim() || null,
        number:             form.number.trim() || null,
        complement:         form.complement.trim() || null,
        neighborhood:       form.neighborhood.trim() || null,
        city:               form.city.trim() || null,
        state:              form.state || null,
        latitude:           form.latitude.trim()  === '' ? null : Number(form.latitude),
        longitude:          form.longitude.trim() === '' ? null : Number(form.longitude),
        amenities:          form.amenities,
        isFeatured:         form.isFeatured,
      };

      const { data } = development
        ? await api.put(`/workspaces/${workspaceId}/developments/${development.id}`, payload)
        : await api.post(`/workspaces/${workspaceId}/developments`, payload);
      onSave(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Informações básicas */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Informações básicas</h3>
          {development && (
            <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
              {development.code}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do empreendimento *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Residencial Jardins do Vale" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Construtora/Incorporadora</label>
            <input className="input" value={form.builderName} onChange={e => set('builderName', e.target.value)} placeholder="Ex: Construtora Alfa" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status da obra</label>
            <select className="input" value={form.constructionStatus} onChange={e => set('constructionStatus', e.target.value as DevelopmentConstructionStatus)}>
              {Object.entries(CONSTRUCTION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Previsão de entrega</label>
            <input className="input" type="date" value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="devIsFeatured" type="checkbox" checked={form.isFeatured} onChange={e => set('isFeatured', e.target.checked)} className="rounded border-gray-300" />
            <label htmlFor="devIsFeatured" className="text-sm text-gray-700">Destacar este empreendimento</label>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
            <textarea className="input resize-none" rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Diferenciais, conceito, lazer, memorial descritivo..." />
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Endereço</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
            <input className="input" value={form.zipCode} onChange={e => set('zipCode', e.target.value)} placeholder="00000-000" />
          </div>
          <div className="col-span-2 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Rua/Avenida</label>
            <input className="input" value={form.street} onChange={e => set('street', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
            <input className="input" value={form.number} onChange={e => set('number', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Complemento</label>
            <input className="input" value={form.complement} onChange={e => set('complement', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
            <input className="input" value={form.neighborhood} onChange={e => set('neighborhood', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
            <input className="input" value={form.city} onChange={e => set('city', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">UF</label>
            <select className="input" value={form.state} onChange={e => set('state', e.target.value)}>
              <option value="">—</option>
              {BRAZIL_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-600 mb-2">Localização no mapa</label>
          <LocationPicker
            latitude={form.latitude.trim() === '' ? null : Number(form.latitude)}
            longitude={form.longitude.trim() === '' ? null : Number(form.longitude)}
            address={[
              [form.street, form.number].filter(Boolean).join(', '),
              form.neighborhood,
              [form.city, form.state].filter(Boolean).join(' - '),
              'Brasil',
            ].filter(Boolean).join(', ')}
            onChange={(lat, lng) => {
              set('latitude',  lat == null ? '' : String(lat));
              set('longitude', lng == null ? '' : String(lng));
            }}
          />
        </div>
      </div>

      {/* Comodidades */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Comodidades e área comum</h3>
        <p className="text-xs text-gray-400 mb-3">Itens de lazer e estrutura do condomínio/empreendimento.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {AMENITIES_LIST.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => toggleAmenity(a)}
              className={
                form.amenities.includes(a)
                  ? 'px-3 py-1.5 rounded-full text-xs font-medium border bg-brand-600 text-white border-brand-600'
                  : 'px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-brand-300'
              }
            >
              {a}
            </button>
          ))}
        </div>
        {customAmenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {customAmenities.map(a => (
              <span key={a} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-brand-600 text-white">
                {a}
                <button type="button" onClick={() => removeAmenity(a)} className="hover:text-brand-200">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 max-w-sm">
          <input
            className="input"
            placeholder="Adicionar comodidade personalizada"
            value={customAmenity}
            onChange={e => setCustomAmenity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAmenity(); } }}
          />
          <button type="button" onClick={addCustomAmenity} className="btn-secondary px-3">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando...' : development ? 'Salvar alterações' : 'Criar empreendimento'}
        </button>
      </div>
    </form>
  );
}
