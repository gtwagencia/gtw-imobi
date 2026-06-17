'use client';

import { useState, useEffect, useCallback } from 'react';
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
  ChevronLeft, ChevronRight, SlidersHorizontal, Star, GitCompare, X, Check,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import clsx from 'clsx';

const LIMIT = 24;

export default function PropertiesPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();

  const [properties, setProperties] = useState<Property[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [search,    setSearch]    = useState('');
  const [type,      setType]      = useState<PropertyType | ''>('');
  const [purpose,   setPurpose]   = useState<PropertyPurpose | ''>('');
  const [status,    setStatus]    = useState<PropertyStatus | ''>('');
  const [city,      setCity]      = useState('');
  const [minPrice,  setMinPrice]  = useState('');
  const [maxPrice,  setMaxPrice]  = useState('');
  const [bedrooms,  setBedrooms]  = useState('');

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/properties`, {
        params: {
          search: search || undefined,
          type: type || undefined,
          purpose: purpose || undefined,
          status: status || undefined,
          city: city || undefined,
          minPrice: minPrice || undefined,
          maxPrice: maxPrice || undefined,
          bedrooms: bedrooms || undefined,
          page,
          limit: LIMIT,
        },
      });
      setProperties(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, search, type, purpose, status, city, minPrice, maxPrice, bedrooms, page]);

  useEffect(() => { load(); }, [load]);

  // Debounce search/filters
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, purpose, status, city, minPrice, maxPrice, bedrooms]);

  const activeFilterCount = [type, purpose, status, city, minPrice, maxPrice, bedrooms].filter(Boolean).length;

  function clearFilters() {
    setType(''); setPurpose(''); setStatus(''); setCity('');
    setMinPrice(''); setMaxPrice(''); setBedrooms('');
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
            <button
              className={clsx('btn-secondary text-sm', compareMode && 'border-brand-300 text-brand-700')}
              onClick={toggleCompareMode}
            >
              {compareMode ? <X className="w-4 h-4" /> : <GitCompare className="w-4 h-4" />}
              {compareMode ? 'Cancelar' : 'Comparar imóveis'}
            </button>
            <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/imoveis/novo')}>
              <Plus className="w-4 h-4" />
              Novo imóvel
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Search + filter toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por título, código, bairro ou cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={clsx('btn-secondary text-sm', activeFilterCount > 0 && 'border-brand-300 text-brand-700')}
            onClick={() => setShowFilters(v => !v)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {activeFilterCount > 0 && (
            <button className="text-sm text-gray-400 hover:text-gray-600" onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <select className="input" value={type} onChange={e => setType(e.target.value as PropertyType | '')}>
                <option value="">Todos</option>
                {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Finalidade</label>
              <select className="input" value={purpose} onChange={e => setPurpose(e.target.value as PropertyPurpose | '')}>
                <option value="">Todas</option>
                {Object.entries(PURPOSE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value as PropertyStatus | '')}>
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
              <input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preço mín.</label>
              <input className="input" type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="R$" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preço máx.</label>
              <input className="input" type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="R$" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quartos (mín.)</label>
              <input className="input" type="number" min="0" value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="0" />
            </div>
          </div>
        )}

        {/* Grid */}
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
                {/* Hero photo — 56% do card */}
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
                  {/* Gradient overlay */}
                  {p.cover_url && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  )}
                  {/* Status badge */}
                  <span className={clsx('absolute top-2.5 left-2.5 text-xs font-semibold px-2.5 py-1 rounded-full shadow-soft', STATUS_COLORS[p.status])}>
                    {STATUS_LABELS[p.status]}
                  </span>
                  {/* Featured star */}
                  {p.is_featured && !compareMode && (
                    <span className="absolute top-2.5 right-2.5 bg-gradient-to-br from-accent-300 to-accent-500 text-accent-900 rounded-full p-1.5 shadow-soft">
                      <Star className="w-3.5 h-3.5" fill="currentColor" />
                    </span>
                  )}
                  {/* Compare checkbox */}
                  {compareMode && (
                    <span className={clsx(
                      'absolute top-2.5 right-2.5 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-soft',
                      selectedIds.includes(p.id) ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white/90 border-gray-300',
                    )}>
                      {selectedIds.includes(p.id) && <Check className="w-4 h-4" />}
                    </span>
                  )}
                  {/* Price overlay at bottom */}
                  {p.cover_url && (
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
                      <p className="font-bold text-white text-sm drop-shadow">{propertyPriceLabel(p)}</p>
                    </div>
                  )}
                </div>

                {/* Info area */}
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

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex justify-center gap-2 mt-6">
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="flex items-center text-sm text-gray-600">
              {page} / {Math.ceil(total / LIMIT)}
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
