'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import type { Development, DevelopmentConstructionStatus } from '@/types';
import { CONSTRUCTION_STATUS_LABELS, AMENITIES_LIST, BRAZIL_STATES } from '@/lib/propertyConstants';
import LocationPicker from './LocationPicker';
import { Plus, X, Building2, Construction, Check, ChevronRight, MapPin, Star, Percent, Calendar, Hash } from 'lucide-react';
import clsx from 'clsx';

interface DevelopmentFormProps {
  development?: Development;
  workspaceId: string;
  onSave: (d: Development) => void;
}

interface FormState {
  mode: 'incorporadora' | 'imobiliaria';
  name: string;
  description: string;
  builderName: string;
  constructionStatus: DevelopmentConstructionStatus;
  deliveryDate: string;
  developmentType: string;
  totalUnits: string;
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
  commissionPct: string;
  videoUrl: string;
}

function toFormState(d?: Development): FormState {
  return {
    mode:               (d as unknown as { mode?: string })?.mode === 'imobiliaria' ? 'imobiliaria' : 'incorporadora',
    name:               d?.name || '',
    description:        d?.description || '',
    builderName:        d?.builder_name || '',
    constructionStatus: d?.construction_status || 'em_obras',
    deliveryDate:       d?.delivery_date ? d.delivery_date.slice(0, 10) : '',
    developmentType:    d?.development_type || 'loteamento',
    totalUnits:         d?.total_units != null ? String(d.total_units) : '',
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
    commissionPct:      d?.commission_pct != null ? String(d.commission_pct) : '',
    videoUrl:           (d as any)?.video_url || '',
  };
}

const DEV_TYPES_INCORPORADORA = [
  { value: 'loteamento',       label: 'Loteamento',          icon: '🗺️', desc: 'Venda de lotes individuais' },
  { value: 'condominio_fechado', label: 'Condomínio Fechado', icon: '🏘️', desc: 'Lotes em condomínio com portaria' },
  { value: 'predio',           label: 'Prédio / Apartamentos', icon: '🏢', desc: 'Unidades verticais por andar' },
  { value: 'comercial',        label: 'Comercial',            icon: '🏬', desc: 'Salas, lojas e escritórios' },
];

const DEV_TYPES_IMOBILIARIA = [
  { value: 'residencial',   label: 'Residencial',   icon: '🏡', desc: 'Casas e apartamentos' },
  { value: 'predio',        label: 'Prédio',        icon: '🏢', desc: 'Edifício com múltiplas unidades' },
  { value: 'loteamento',    label: 'Loteamento',    icon: '🗺️', desc: 'Lotes para venda ou locação' },
  { value: 'comercial',     label: 'Comercial',     icon: '🏬', desc: 'Salas, lojas e galpões' },
];

const STATUS_OPTIONS = [
  { value: 'na_planta',     label: 'Na planta',     color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'em_obras',      label: 'Em obras',      color: 'bg-amber-100 text-amber-700 border-amber-200'   },
  { value: 'pronto',        label: 'Pronto',        color: 'bg-green-100 text-green-700 border-green-200'   },
  { value: 'entregue',      label: 'Entregue',      color: 'bg-blue-100 text-blue-700 border-blue-200'      },
  { value: 'suspensa',      label: 'Suspensa',      color: 'bg-red-100 text-red-600 border-red-200'         },
];

// Garante compatibilidade com valores que não estejam na lista acima
function getStatusColor(v: string) {
  return STATUS_OPTIONS.find(s => s.value === v)?.color ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DevelopmentForm({ development, workspaceId, onSave }: DevelopmentFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(development));
  const [customAmenity, setCustomAmenity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isNew = !development;

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

  const devTypes = form.mode === 'incorporadora' ? DEV_TYPES_INCORPORADORA : DEV_TYPES_IMOBILIARIA;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true); setError('');
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
        commissionPct:      form.commissionPct.trim() === '' ? null : Number(form.commissionPct),
        developmentType:    form.developmentType || null,
        totalUnits:         form.totalUnits.trim() === '' ? null : Number(form.totalUnits),
        videoUrl:           form.videoUrl.trim() || null,
      };

      const { data } = development
        ? await api.put(`/workspaces/${workspaceId}/developments/${development.id}`, payload)
        : await api.post(`/workspaces/${workspaceId}/developments`, payload);
      onSave(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-3xl mx-auto">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Modo: Imobiliária ou Incorporadora ── */}
      {isNew && (
        <div className="card p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Como você vai usar este empreendimento?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { set('mode', 'incorporadora'); set('developmentType', 'loteamento'); }}
              className={clsx(
                'relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all',
                form.mode === 'incorporadora'
                  ? 'border-brand-500 bg-brand-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              )}
            >
              {form.mode === 'incorporadora' && (
                <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </span>
              )}
              <span className="text-2xl">🏗️</span>
              <div>
                <p className="font-bold text-gray-900 text-sm">Incorporadora / Construtora</p>
                <p className="text-xs text-gray-500 mt-0.5">Vendo unidades diretamente — lotes, apartamentos, salas. Com mapa, gestão de unidades e propostas.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { set('mode', 'imobiliaria'); set('developmentType', 'residencial'); }}
              className={clsx(
                'relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all',
                form.mode === 'imobiliaria'
                  ? 'border-brand-500 bg-brand-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              )}
            >
              {form.mode === 'imobiliaria' && (
                <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </span>
              )}
              <span className="text-2xl">🏢</span>
              <div>
                <p className="font-bold text-gray-900 text-sm">Imobiliária</p>
                <p className="text-xs text-gray-500 mt-0.5">Intermediando um empreendimento de terceiros — cadastro simplificado para organizar seus imóveis.</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Identificação ── */}
      <div className="card p-5">
        <SectionHeader icon={<Building2 className="w-4 h-4" />} title="Identificação" subtitle="Nome e dados básicos do empreendimento" />
        <div className="space-y-4">
          <div>
            <label className="label">Nome do empreendimento <span className="text-red-500">*</span></label>
            <input
              className="input text-base font-semibold"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder={form.mode === 'incorporadora' ? 'Ex: Residencial Jardins do Vale' : 'Ex: Edifício Central Park'}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{form.mode === 'incorporadora' ? 'Construtora / Incorporadora' : 'Proprietário / Construtora'}</label>
              <input className="input" value={form.builderName} onChange={e => set('builderName', e.target.value)} placeholder="Ex: Construtora Alfa" />
            </div>
            <div>
              <label className="label">% Comissão{' '}
                <span className="text-gray-400 font-normal">(sobrescreve o padrão)</span>
              </label>
              <div className="relative">
                <input className="input pr-7" type="number" min="0" max="100" step="0.01" value={form.commissionPct} onChange={e => set('commissionPct', e.target.value)} placeholder="Ex: 5" />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100 cursor-pointer select-none" onClick={() => set('isFeatured', !form.isFeatured)}>
            <div className={clsx('w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors', form.isFeatured ? 'border-amber-500 bg-amber-500' : 'border-gray-300')}>
              {form.isFeatured && <Star className="w-2.5 h-2.5 text-white fill-white" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Destacar empreendimento</p>
              <p className="text-xs text-gray-500">Aparece em destaque no portal e nas listagens</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tipo ── */}
      <div className="card p-5">
        <SectionHeader icon={<Hash className="w-4 h-4" />} title="Tipo de empreendimento" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
          {devTypes.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => set('developmentType', t.value)}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all text-xs',
                form.developmentType === t.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="font-semibold leading-tight">{t.label}</span>
              <span className={clsx('text-xs leading-tight', form.developmentType === t.value ? 'text-brand-500' : 'text-gray-400')}>{t.desc}</span>
            </button>
          ))}
        </div>

        {form.mode === 'incorporadora' && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
            <div>
              <label className="label flex items-center gap-1.5"><Hash className="w-3 h-3 text-gray-400" /> Total de unidades</label>
              <input className="input" type="number" min="0" step="1" value={form.totalUnits} onChange={e => set('totalUnits', e.target.value)} placeholder="Ex: 200 lotes" />
            </div>
          </div>
        )}
      </div>

      {/* ── Status da obra ── */}
      <div className="card p-5">
        <SectionHeader icon={<Construction className="w-4 h-4" />} title="Status da obra" subtitle="Situação atual da construção" />
        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => set('constructionStatus', s.value as DevelopmentConstructionStatus)}
              className={clsx(
                'px-3.5 py-1.5 rounded-full text-xs font-semibold border-2 transition-all',
                form.constructionStatus === s.value
                  ? `${s.color} border-current shadow-sm scale-105`
                  : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
              )}
            >
              {s.label}
            </button>
          ))}
          {/* Fallback para valores não mapeados */}
          {!STATUS_OPTIONS.find(s => s.value === form.constructionStatus) && (
            <span className={clsx('px-3.5 py-1.5 rounded-full text-xs font-semibold border-2', getStatusColor(form.constructionStatus))}>
              {CONSTRUCTION_STATUS_LABELS[form.constructionStatus as keyof typeof CONSTRUCTION_STATUS_LABELS] || form.constructionStatus}
            </span>
          )}
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><Calendar className="w-3 h-3 text-gray-400" /> Previsão de entrega</label>
          <input className="input max-w-xs" type="date" value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} />
        </div>
      </div>

      {/* ── Descrição ── */}
      <div className="card p-5 space-y-4">
        <SectionHeader icon={<ChevronRight className="w-4 h-4" />} title="Descrição" subtitle="Apresentação para clientes e portais" />
        <textarea
          className="input resize-none w-full"
          rows={4}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder={form.mode === 'incorporadora'
            ? 'Diferenciais, conceito do projeto, infraestrutura, lazer, memorial descritivo...'
            : 'Características do empreendimento, localização, diferenciais para o cliente...'}
        />
        <div>
          <label className="label">Link de vídeo / Tour virtual</label>
          <input
            className="input"
            value={form.videoUrl}
            onChange={e => set('videoUrl', e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... ou link direto do vídeo"
          />
          <p className="text-xs text-gray-400 mt-1">O chatbot envia este link automaticamente ao apresentar o empreendimento.</p>
        </div>
      </div>

      {/* ── Endereço ── */}
      <div className="card p-5">
        <SectionHeader icon={<MapPin className="w-4 h-4" />} title="Localização" subtitle="Endereço e coordenadas no mapa" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label">CEP</label>
            <input className="input font-mono" value={form.zipCode} onChange={e => set('zipCode', e.target.value)} placeholder="00000-000" />
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Avenida</label>
            <input className="input" value={form.street} onChange={e => set('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.number} onChange={e => set('number', e.target.value)} placeholder="S/N" />
          </div>
          <div className="col-span-2">
            <label className="label">Complemento</label>
            <input className="input" value={form.complement} onChange={e => set('complement', e.target.value)} placeholder="Bloco, quadra..." />
          </div>
          <div className="col-span-2">
            <label className="label">Bairro</label>
            <input className="input" value={form.neighborhood} onChange={e => set('neighborhood', e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-3">
            <label className="label">Cidade</label>
            <input className="input" value={form.city} onChange={e => set('city', e.target.value)} />
          </div>
          <div>
            <label className="label">UF</label>
            <select className="input" value={form.state} onChange={e => set('state', e.target.value)}>
              <option value="">—</option>
              {BRAZIL_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
        <div className="pt-4 border-t border-gray-100">
          <label className="label flex items-center gap-1.5 mb-2"><MapPin className="w-3 h-3 text-gray-400" /> Pin no mapa</label>
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

      {/* ── Comodidades ── */}
      <div className="card p-5">
        <SectionHeader icon={<Star className="w-4 h-4" />} title="Comodidades e área comum" subtitle="Estrutura de lazer e infraestrutura do empreendimento" />
        <div className="flex flex-wrap gap-2 mb-4">
          {AMENITIES_LIST.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => toggleAmenity(a)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all',
                form.amenities.includes(a)
                  ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300'
              )}
            >
              {form.amenities.includes(a) && <Check className="w-3 h-3 inline mr-1" />}
              {a}
            </button>
          ))}
        </div>
        {/* Comodidades personalizadas */}
        {form.amenities.filter(a => !AMENITIES_LIST.includes(a)).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {form.amenities.filter(a => !AMENITIES_LIST.includes(a)).map(a => (
              <span key={a} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-brand-500 text-white border-2 border-brand-500">
                {a}
                <button type="button" onClick={() => setForm(prev => ({ ...prev, amenities: prev.amenities.filter(x => x !== a) }))} className="hover:text-brand-200 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 max-w-sm mt-2">
          <input
            className="input text-sm"
            placeholder="Adicionar comodidade..."
            value={customAmenity}
            onChange={e => setCustomAmenity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAmenity(); } }}
          />
          <button type="button" onClick={addCustomAmenity} className="btn-secondary px-3 flex-shrink-0">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <p className="text-xs text-gray-400">
          {form.mode === 'incorporadora'
            ? '🏗️ Incorporadora — mapa de lotes e gestão de unidades disponíveis após criar'
            : '🏢 Imobiliária — adicione imóveis individualmente após criar'}
        </p>
        <button type="submit" disabled={saving} className="btn-primary px-6 py-2.5 text-sm font-semibold">
          {saving ? 'Salvando...' : development ? 'Salvar alterações' : 'Criar empreendimento →'}
        </button>
      </div>
    </form>
  );
}
