'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import type { Property, PropertyType, PropertyPurpose, PropertyStatus, Contact, Development } from '@/types';
import {
  PROPERTY_TYPE_LABELS, PURPOSE_LABELS, STATUS_LABELS, AMENITIES_LIST, BRAZIL_STATES,
} from '@/lib/propertyConstants';
import LocationPicker from './LocationPicker';
import { Plus, X, Sparkles, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface Member {
  user_id?: string;
  id?: string;
  name: string;
  creci?: string | null;
}

interface PropertyFormProps {
  property?: Property;
  workspaceId: string;
  orgId: string;
  initialDevelopmentId?: string;
  onSave: (p: Property) => void;
  readOnly?: boolean;
}

interface FormState {
  title: string;
  description: string;
  propertyType: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
  hideAddress: boolean;
  salePrice: string;
  rentPrice: string;
  condoFee: string;
  iptu: string;
  totalArea: string;
  builtArea: string;
  bedrooms: string;
  bathrooms: string;
  suites: string;
  parkingSpots: string;
  floorNumber: string;
  yearBuilt: string;
  amenities: string[];
  ownerId: string;
  ownerName: string;
  brokerId: string;
  scoutId: string;
  developmentId: string;
  videoUrl: string;
  isFeatured: boolean;
}

function toFormState(p?: Property, initialDevelopmentId?: string): FormState {
  return {
    title:        p?.title || '',
    description:  p?.description || '',
    propertyType: p?.property_type || 'apartamento',
    purpose:      p?.purpose || 'venda',
    status:       p?.status || 'disponivel',
    zipCode:      p?.zip_code || '',
    street:       p?.street || '',
    number:       p?.number || '',
    complement:   p?.complement || '',
    neighborhood: p?.neighborhood || '',
    city:         p?.city || '',
    state:        p?.state || '',
    latitude:     p?.latitude  != null ? String(p.latitude)  : '',
    longitude:    p?.longitude != null ? String(p.longitude) : '',
    hideAddress:  p?.hide_address || false,
    salePrice:    p?.sale_price   != null ? String(p.sale_price)   : '',
    rentPrice:    p?.rent_price   != null ? String(p.rent_price)   : '',
    condoFee:     p?.condo_fee    != null ? String(p.condo_fee)    : '',
    iptu:         p?.iptu         != null ? String(p.iptu)         : '',
    totalArea:    p?.total_area   != null ? String(p.total_area)   : '',
    builtArea:    p?.built_area   != null ? String(p.built_area)   : '',
    bedrooms:     p?.bedrooms     != null ? String(p.bedrooms)     : '',
    bathrooms:    p?.bathrooms    != null ? String(p.bathrooms)    : '',
    suites:       p?.suites       != null ? String(p.suites)       : '',
    parkingSpots: p?.parking_spots != null ? String(p.parking_spots) : '',
    floorNumber:  p?.floor_number != null ? String(p.floor_number) : '',
    yearBuilt:    p?.year_built   != null ? String(p.year_built)   : '',
    amenities:    p?.amenities || [],
    ownerId:      p?.owner_id  || '',
    ownerName:    p?.owner_name || '',
    brokerId:     p?.broker_id || '',
    scoutId:      p?.scout_id  || '',
    developmentId: p?.development_id || initialDevelopmentId || '',
    videoUrl:     (p as any)?.video_url || '',
    isFeatured:   p?.is_featured || false,
  };
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const int = (v: string) => (v.trim() === '' ? null : parseInt(v, 10));

export default function PropertyForm({ property, workspaceId, orgId, initialDevelopmentId, onSave, readOnly = false }: PropertyFormProps) {
  const [form,     setForm]     = useState<FormState>(() => toFormState(property, initialDevelopmentId));
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members,  setMembers]  = useState<Member[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [customAmenity, setCustomAmenity] = useState('');
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const [generatingDesc,  setGeneratingDesc]  = useState(false);

  useEffect(() => { setForm(toFormState(property, initialDevelopmentId)); }, [property, initialDevelopmentId]);

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/contacts`, { params: { limit: 200 } })
      .then(({ data }) => setContacts(data.data))
      .catch(() => {});
    api.get(`/orgs/${orgId}/workspaces/${workspaceId}/members`)
      .then(({ data }) => setMembers(data))
      .catch(() => {});
    api.get(`/workspaces/${workspaceId}/developments`, { params: { limit: 200 } })
      .then(({ data }) => setDevelopments(data.data))
      .catch(() => {});
  }, [workspaceId, orgId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleGenerateDescription() {
    setGeneratingDesc(true);
    try {
      const endpoint = property?.id
        ? `/workspaces/${workspaceId}/properties/${property.id}/generate-description`
        : `/workspaces/${workspaceId}/properties/generate-description`;
      const body = property?.id ? undefined : form;
      const { data } = await api.post(endpoint, body);
      if (data.description) set('description', data.description);
    } catch {
      // falha silenciosa — usuário pode tentar de novo
    } finally {
      setGeneratingDesc(false);
    }
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Título é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title:        form.title.trim(),
        description:  form.description.trim() || null,
        propertyType: form.propertyType,
        purpose:      form.purpose,
        status:       form.status,
        zipCode:      form.zipCode.trim() || null,
        street:       form.street.trim() || null,
        number:       form.number.trim() || null,
        complement:   form.complement.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city:         form.city.trim() || null,
        state:        form.state || null,
        latitude:     num(form.latitude),
        longitude:    num(form.longitude),
        hideAddress:  form.hideAddress,
        salePrice:    num(form.salePrice),
        rentPrice:    num(form.rentPrice),
        condoFee:     num(form.condoFee),
        iptu:         num(form.iptu),
        totalArea:    num(form.totalArea),
        builtArea:    num(form.builtArea),
        bedrooms:     int(form.bedrooms),
        bathrooms:    int(form.bathrooms),
        suites:       int(form.suites),
        parkingSpots: int(form.parkingSpots),
        floorNumber:  int(form.floorNumber),
        yearBuilt:    int(form.yearBuilt),
        amenities:    form.amenities,
        ownerId:      form.ownerId || null,
        brokerId:     form.brokerId || null,
        scoutId:      form.scoutId || null,
        developmentId: form.developmentId || null,
        videoUrl:     form.videoUrl.trim() || null,
        isFeatured:   form.isFeatured,
      };

      const { data } = property
        ? await api.put(`/workspaces/${workspaceId}/properties/${property.id}`, payload)
        : await api.post(`/workspaces/${workspaceId}/properties`, payload);
      onSave(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const showSalePrice = form.purpose === 'venda' || form.purpose === 'venda_locacao';
  const showRentPrice = form.purpose === 'locacao' || form.purpose === 'venda_locacao' || form.purpose === 'temporada';

  const customAmenities = form.amenities.filter(a => !AMENITIES_LIST.includes(a));

  return (
    <form onSubmit={submit} className="space-y-5">
      {readOnly && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Você tem acesso somente leitura. Edições em imóveis são restritas a administradores.
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <fieldset disabled={readOnly} className="contents">
      {/* Informações básicas */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Informações básicas</h3>
          {property && (
            <span className="text-xs font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
              {property.code}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Apartamento 3 quartos com vista no Centro" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de imóvel</label>
            <select className="input" value={form.propertyType} onChange={e => set('propertyType', e.target.value as PropertyType)}>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Finalidade</label>
            <select className="input" value={form.purpose} onChange={e => set('purpose', e.target.value as PropertyPurpose)}>
              {Object.entries(PURPOSE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value as PropertyStatus)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="isFeatured" type="checkbox" checked={form.isFeatured} onChange={e => set('isFeatured', e.target.checked)} className="rounded border-gray-300" />
            <label htmlFor="isFeatured" className="text-sm text-gray-700">Destacar este imóvel</label>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Descrição</label>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={generatingDesc}
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50 transition-colors"
              >
                {generatingDesc
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando...</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Gerar com IA</>}
              </button>
            </div>
            <textarea className="input resize-none" rows={5} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descreva o imóvel ou clique em 'Gerar com IA' para criar automaticamente..." />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Link de vídeo / Tour virtual</label>
            <input
              className="input"
              value={form.videoUrl}
              onChange={e => set('videoUrl', e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... ou link direto do vídeo"
            />
            <p className="text-xs text-gray-400 mt-1">Quando preenchido, o chatbot envia este link automaticamente ao apresentar o imóvel.</p>
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
            <input className="input" value={form.complement} onChange={e => set('complement', e.target.value)} placeholder="Bloco, apto, sala..." />
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
          <div className="col-span-2 md:col-span-4 flex items-center gap-2 pt-1">
            <input id="hideAddress" type="checkbox" checked={form.hideAddress} onChange={e => set('hideAddress', e.target.checked)} className="rounded border-gray-300" />
            <label htmlFor="hideAddress" className="text-sm text-gray-700">Ocultar endereço exato em divulgações públicas (mostrar apenas bairro/cidade)</label>
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

      {/* Empreendimento */}
      {developments.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Empreendimento</h3>
          <p className="text-xs text-gray-400 mb-3">Vincule esta unidade a um empreendimento/lançamento cadastrado, se aplicável.</p>
          <div className="max-w-md">
            <select className="input" value={form.developmentId} onChange={e => set('developmentId', e.target.value)}>
              <option value="">— Imóvel de terceiro (sem vínculo) —</option>
              {developments.map(d => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Valores */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Valores</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {showSalePrice && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor de venda (R$)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.salePrice} onChange={e => set('salePrice', e.target.value)} />
            </div>
          )}
          {showRentPrice && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor de locação (R$/mês)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.rentPrice} onChange={e => set('rentPrice', e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Condomínio (R$)</label>
            <input className="input" type="number" step="0.01" min="0" value={form.condoFee} onChange={e => set('condoFee', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">IPTU (R$)</label>
            <input className="input" type="number" step="0.01" min="0" value={form.iptu} onChange={e => set('iptu', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Características */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Características</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Área total (m²)</label>
            <input className="input" type="number" step="0.01" min="0" value={form.totalArea} onChange={e => set('totalArea', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Área construída (m²)</label>
            <input className="input" type="number" step="0.01" min="0" value={form.builtArea} onChange={e => set('builtArea', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quartos</label>
            <input className="input" type="number" min="0" value={form.bedrooms} onChange={e => set('bedrooms', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Suítes</label>
            <input className="input" type="number" min="0" value={form.suites} onChange={e => set('suites', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Banheiros</label>
            <input className="input" type="number" min="0" value={form.bathrooms} onChange={e => set('bathrooms', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vagas de garagem</label>
            <input className="input" type="number" min="0" value={form.parkingSpots} onChange={e => set('parkingSpots', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Andar</label>
            <input className="input" type="number" value={form.floorNumber} onChange={e => set('floorNumber', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ano de construção</label>
            <input className="input" type="number" min="1900" max="2100" value={form.yearBuilt} onChange={e => set('yearBuilt', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Comodidades */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Comodidades</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {AMENITIES_LIST.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => toggleAmenity(a)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                form.amenities.includes(a)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
              )}
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

      {/* Responsáveis */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Responsáveis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Proprietário</label>
            <input
              list="property-owners-list"
              className="input"
              value={form.ownerName}
              onChange={e => set('ownerName', e.target.value)}
              onBlur={() => {
                const matched = contacts.find(c => c.name === form.ownerName);
                set('ownerId', matched?.id || '');
                if (!matched) set('ownerName', '');
              }}
              placeholder="Buscar contato..."
            />
            <datalist id="property-owners-list">
              {contacts.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Corretor responsável</label>
            <select className="input" value={form.brokerId} onChange={e => set('brokerId', e.target.value)}>
              <option value="">—</option>
              {members.map(m => <option key={m.user_id || m.id} value={m.user_id || m.id}>{m.name}{m.creci ? ` (CRECI ${m.creci})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Captador</label>
            <select className="input" value={form.scoutId} onChange={e => set('scoutId', e.target.value)}>
              <option value="">—</option>
              {members.map(m => <option key={m.user_id || m.id} value={m.user_id || m.id}>{m.name}{m.creci ? ` (CRECI ${m.creci})` : ''}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Salvando...' : property ? 'Salvar alterações' : 'Criar imóvel'}
          </button>
        </div>
      )}
      </fieldset>
    </form>
  );
}
