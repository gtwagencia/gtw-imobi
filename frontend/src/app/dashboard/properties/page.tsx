'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Property, PropertyType, PropertyPurpose, PropertyStatus } from '@/types';
import {
  PROPERTY_TYPE_LABELS, PURPOSE_LABELS, STATUS_LABELS, STATUS_COLORS,
  formatArea, propertyPriceLabel,
} from '@/lib/propertyConstants';
import {
  Search, Plus, Building2, BedDouble, Bath, Car, Ruler,
  ChevronLeft, ChevronRight, SlidersHorizontal, Star, GitCompare,
  X, Check, ChevronDown, ChevronUp, MapPin,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import clsx from 'clsx';

const LIMIT = 24;

interface FilterOptions {
  cities: string[];
  neighborhoods: string[];
}

export default function PropertiesPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();
  const isBroker = currentWorkspace?.role === 'agent' || currentWorkspace?.role === 'member';

  const [properties, setProperties] = useState<Property[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter options from API
  const [filterOptions, setFilterOptions]         = useState<FilterOptions>({ cities: [], neighborhoods: [] });
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);

  // Filter state
  const [search,       setSearch]       = useState('');
  const [type,         setType]         = useState<PropertyType | ''>('');
  const [purpose,      setPurpose]      = useState<PropertyPurpose | ''>('');
  const [status,       setStatus]       = useState<PropertyStatus | ''>('');
  const [city,         setCity]         = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [minPrice,     setMinPrice]     = useState('');
  const [maxPrice,     setMaxPrice]     = useState('');
  const [bedrooms,     setBedrooms]     = useState('');
  const [suites,       setSuites]       = useState('');
  const [bathrooms,    setBathrooms]    = useState('');
  const [parkingSpots, setParkingSpots] = useState('');
  const [minArea,      setMinArea]      = useState('');
  const [maxArea,      setMaxArea]      = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load cities on mount
  useEffect(() => {
    if (!currentWorkspace) return;
    api.get(`/workspaces/${currentWorkspace.id}/properties/filters`)
      .then(({ data }) => setFilterOptions(prev => ({ ...prev, cities: data.cities || [], neighborhoods: data.neighborhoods || [] })))
      .catch(() => {});
  }, [currentWorkspace]);

  // Load neighborhoods when city changes
  useEffect(() => {
    if (!currentWorkspace) return;
    setNeighborhood('');
    setLoadingNeighborhoods(true);
    api.get(`/workspaces/${currentWorkspace.id}/properties/filters`, { params: city ? { city } : undefined })
      .then(({ data }) => setFilterOptions(prev => ({ ...prev, neighborhoods: data.neighborhoods || [] })))
      .catch(() => {})
      .finally(() => setLoadingNeighborhoods(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, currentWorkspace?.id]);

  const fetchProperties = useCallback((pg: number) => {
    if (!currentWorkspace) return;
    setLoading(true);
    api.get(`/workspaces/${currentWorkspace.id}/properties`, {
      params: {
        search:       search       || undefined,
        type:         type         || undefined,
        purpose:      purpose      || undefined,
        status:       status       || undefined,
        city:         city         || undefined,
        neighborhood: neighborhood || undefined,
        minPrice:     minPrice     || undefined,
        maxPrice:     maxPrice     || undefined,
        bedrooms:     bedrooms     || undefined,
        suites:       suites       || undefined,
        bathrooms:    bathrooms    || undefined,
        parkingSpots: parkingSpots || undefined,
        minArea:      minArea      || undefined,
        maxArea:      maxArea      || undefined,
        page:         pg,
        limit:        LIMIT,
      },
    }).then(({ data }) => {
      setProperties(data.data);
      setTotal(data.total);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [currentWorkspace, search, type, purpose, status, city, neighborhood,
      minPrice, maxPrice, bedrooms, suites, bathrooms, parkingSpots, minArea, maxArea]);

  // Page change: immediate fetch
  useEffect(() => { fetchProperties(page); }, [page, fetchProperties]);

  // Select filters: reset page + immediate fetch
  useEffect(() => {
    setPage(1);
    fetchProperties(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, purpose, status, city, neighborhood, bedrooms, suites, bathrooms, parkingSpots]);

  // Text filters: debounced reset + fetch
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setPage(1);
      fetchProperties(1);
    }, 400);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, minPrice, maxPrice, minArea, maxArea]);

  const basicFilterCount    = [type, purpose, status, city, neighborhood].filter(Boolean).length;
  const advancedFilterCount = [minPrice, maxPrice, bedrooms, suites, bathrooms, parkingSpots, minArea, maxArea].filter(Boolean).length;
  const activeFilterCount   = basicFilterCount + advancedFilterCount;

  function clearFilters() {
    setType(''); setPurpose(''); setStatus(''); setCity(''); setNeighborhood('');
    setMinPrice(''); setMaxPrice(''); setBedrooms(''); setSuites('');
    setBathrooms(''); setParkingSpots(''); setMinArea(''); setMaxArea('');
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleCompareMode() {
    setCompareMode(v => !v);
    setSelectedIds([]);
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Imóveis" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`Imóveis (${total})`}
        actions={
          <div className="flex items-center gap-2">
            {!isBroker && (
              <button
                className={clsx('btn-secondary text-sm', compareMode && 'border-brand-300 text-brand-700')}
                onClick={toggleCompareMode}
              >
                {compareMode ? <X className="w-4 h-4" /> : <GitCompare className="w-4 h-4" />}
                {compareMode ? 'Cancelar' : 'Comparar'}
              </button>
            )}
            {!isBroker && (
              <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/imoveis/novo')}>
                <Plus className="w-4 h-4" />
                Novo imóvel
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* ── Barra de busca + filtros principais ─────────────────────────── */}
        <div className="card p-3 mb-4 space-y-3">
          {/* Linha 1: busca + limpar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por título, código, bairro ou cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {activeFilterCount > 0 && (
              <button className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1 shrink-0" onClick={clearFilters}>
                <X className="w-3.5 h-3.5" />
                Limpar ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Linha 2: filtros principais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo</label>
              <select className="input text-sm py-1.5" value={type} onChange={e => setType(e.target.value as PropertyType | '')}>
                <option value="">Todos os tipos</option>
                {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Finalidade</label>
              <select className="input text-sm py-1.5" value={purpose} onChange={e => setPurpose(e.target.value as PropertyPurpose | '')}>
                <option value="">Todas</option>
                {Object.entries(PURPOSE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Status</label>
              <select className="input text-sm py-1.5" value={status} onChange={e => setStatus(e.target.value as PropertyStatus | '')}>
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Cidade
              </label>
              <select className="input text-sm py-1.5" value={city} onChange={e => setCity(e.target.value)}>
                <option value="">Todas as cidades</option>
                {filterOptions.cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Bairro
              </label>
              <select
                className="input text-sm py-1.5"
                value={neighborhood}
                onChange={e => setNeighborhood(e.target.value)}
                disabled={loadingNeighborhoods || filterOptions.neighborhoods.length === 0}
              >
                <option value="">
                  {loadingNeighborhoods
                    ? 'Carregando...'
                    : filterOptions.neighborhoods.length === 0
                      ? city ? 'Sem bairros' : 'Todos os bairros'
                      : 'Todos os bairros'}
                </option>
                {filterOptions.neighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Linha 3: toggle filtros avançados */}
          <button
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
            onClick={() => setShowAdvanced(v => !v)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros avançados
            {advancedFilterCount > 0 && (
              <span className="bg-brand-100 text-brand-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {advancedFilterCount}
              </span>
            )}
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Filtros avançados colapsáveis */}
          {showAdvanced && (
            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Preço mín.</label>
                <input className="input text-sm py-1.5" type="number" min="0" step="10000" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="R$" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Preço máx.</label>
                <input className="input text-sm py-1.5" type="number" min="0" step="10000" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="R$" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Quartos (mín.)</label>
                <select className="input text-sm py-1.5" value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
                  <option value="">Qualquer</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Suítes (mín.)</label>
                <select className="input text-sm py-1.5" value={suites} onChange={e => setSuites(e.target.value)}>
                  <option value="">Qualquer</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Banheiros (mín.)</label>
                <select className="input text-sm py-1.5" value={bathrooms} onChange={e => setBathrooms(e.target.value)}>
                  <option value="">Qualquer</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Vagas (mín.)</label>
                <select className="input text-sm py-1.5" value={parkingSpots} onChange={e => setParkingSpots(e.target.value)}>
                  <option value="">Qualquer</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Área mín. (m²)</label>
                <input className="input text-sm py-1.5" type="number" min="0" value={minArea} onChange={e => setMinArea(e.target.value)} placeholder="m²" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Área máx. (m²)</label>
                <input className="input text-sm py-1.5" type="number" min="0" value={maxArea} onChange={e => setMaxArea(e.target.value)} placeholder="m²" />
              </div>
            </div>
          )}
        </div>

        {/* ── Grid de imóveis ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="h-40 bg-gray-100 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-100 animate-pulse rounded w-3/4" />
                  <div className="h-3 bg-gray-100 animate-pulse rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : properties.length === 0 ? (
          <EmptyState
            illustration="properties"
            title="Nenhum imóvel encontrado"
            description={activeFilterCount > 0 ? 'Tente ajustar os filtros para ver mais resultados.' : 'Comece cadastrando seu primeiro imóvel.'}
            action={activeFilterCount === 0 ? (
              <button className="btn-primary" onClick={() => router.push('/dashboard/imoveis/novo')}>
                <Plus className="w-4 h-4" /> Cadastrar imóvel
              </button>
            ) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {properties.map((p) => (
              <button
                key={p.id}
                onClick={() => compareMode ? toggleSelected(p.id) : router.push(`/dashboard/imoveis/${p.id}`)}
                className={clsx(
                  'card overflow-hidden text-left hover:shadow-nav hover:-translate-y-1 transition-all duration-200 group',
                  compareMode && selectedIds.includes(p.id) && 'ring-2 ring-brand-400',
                )}
              >
                <div className="relative h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                  {p.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-300">
                      <Building2 className="w-12 h-12" />
                      <span className="text-xs">Sem foto</span>
                    </div>
                  )}
                  {p.cover_url && <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />}
                  <span className={clsx('absolute top-2.5 left-2.5 text-xs font-semibold px-2.5 py-1 rounded-full shadow-soft', STATUS_COLORS[p.status])}>
                    {STATUS_LABELS[p.status]}
                  </span>
                  {p.is_featured && !compareMode && (
                    <span className="absolute top-2.5 right-2.5 bg-gradient-to-br from-accent-300 to-accent-500 text-accent-900 rounded-full p-1.5 shadow-soft">
                      <Star className="w-3.5 h-3.5" fill="currentColor" />
                    </span>
                  )}
                  {compareMode && (
                    <span className={clsx(
                      'absolute top-2.5 right-2.5 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-soft',
                      selectedIds.includes(p.id) ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white/90 border-gray-300',
                    )}>
                      {selectedIds.includes(p.id) && <Check className="w-4 h-4" />}
                    </span>
                  )}
                  {p.cover_url && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
                      <p className="font-bold text-white text-sm drop-shadow">{propertyPriceLabel(p)}</p>
                    </div>
                  )}
                </div>

                <div className="p-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-gray-400 tracking-wider">{p.code}</span>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{PROPERTY_TYPE_LABELS[p.property_type]}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1 group-hover:text-brand-600 transition-colors leading-snug">
                    {p.title}
                  </h3>
                  <p className="text-xs text-gray-500 mb-2 truncate">
                    {[p.neighborhood, p.city].filter(Boolean).join(', ') || '—'}
                  </p>
                  {!p.cover_url && (
                    <p className="font-bold text-brand-700 mb-2 text-sm">{propertyPriceLabel(p)}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {p.bedrooms != null && (
                      <span className="flex items-center gap-1 font-medium"><BedDouble className="w-3.5 h-3.5" />{p.bedrooms}</span>
                    )}
                    {p.bathrooms != null && (
                      <span className="flex items-center gap-1 font-medium"><Bath className="w-3.5 h-3.5" />{p.bathrooms}</span>
                    )}
                    {p.parking_spots != null && (
                      <span className="flex items-center gap-1 font-medium"><Car className="w-3.5 h-3.5" />{p.parking_spots}</span>
                    )}
                    {(p.total_area != null || p.built_area != null) && (
                      <span className="flex items-center gap-1 font-medium"><Ruler className="w-3.5 h-3.5" />{formatArea(p.built_area ?? p.total_area)}</span>
                    )}
                  </div>
                  {p.broker_name && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                      Corretor: <span className="text-gray-600 font-medium">{p.broker_name}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Barra flutuante de comparação */}
        {compareMode && selectedIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full shadow-xl px-5 py-3 flex items-center gap-4 z-40">
            <span className="text-sm">{selectedIds.length} selecionado{selectedIds.length > 1 ? 's' : ''}</span>
            <button
              className="btn-primary text-sm"
              disabled={selectedIds.length < 2}
              onClick={() => router.push(`/dashboard/imoveis/comparar?ids=${selectedIds.join(',')}`)}
            >
              <GitCompare className="w-4 h-4" />
              Comparar
            </button>
          </div>
        )}

        {/* Paginação */}
        {total > LIMIT && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-sm text-gray-600">
              Página {page} de {Math.ceil(total / LIMIT)} &nbsp;·&nbsp; {total} imóveis
            </span>
            <button className="btn-secondary" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(p => p + 1)}>
              Próxima
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
