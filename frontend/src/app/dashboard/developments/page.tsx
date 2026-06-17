'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Development, DevelopmentConstructionStatus } from '@/types';
import { CONSTRUCTION_STATUS_LABELS, CONSTRUCTION_STATUS_COLORS } from '@/lib/propertyConstants';
import {
  Search, Plus, Construction, ChevronLeft, ChevronRight, SlidersHorizontal, Star, Layers,
} from 'lucide-react';
import clsx from 'clsx';

const LIMIT = 24;

export default function DevelopmentsPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();

  const [developments, setDevelopments] = useState<Development[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState('');
  const [constructionStatus, setConstructionStatus] = useState<DevelopmentConstructionStatus | ''>('');
  const [city, setCity] = useState('');

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/developments`, {
        params: {
          search: search || undefined,
          constructionStatus: constructionStatus || undefined,
          city: city || undefined,
          page,
          limit: LIMIT,
        },
      });
      setDevelopments(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, search, constructionStatus, city, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, constructionStatus, city]);

  const activeFilterCount = [constructionStatus, city].filter(Boolean).length;

  function clearFilters() {
    setConstructionStatus(''); setCity('');
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Empreendimentos" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`Empreendimentos (${total})`}
        actions={
          <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/empreendimentos/new')}>
            <Plus className="w-4 h-4" />
            Novo empreendimento
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Search + filter toggle */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, código, bairro ou cidade..."
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
          <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status da obra</label>
              <select className="input" value={constructionStatus} onChange={e => setConstructionStatus(e.target.value as DevelopmentConstructionStatus | '')}>
                <option value="">Todos</option>
                {Object.entries(CONSTRUCTION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
              <input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" />
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
        ) : developments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Construction className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum empreendimento cadastrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {developments.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/dashboard/empreendimentos/${d.id}`)}
                className="card overflow-hidden text-left hover:shadow-lg hover:-translate-y-0.5 transition-all group"
              >
                <div className="relative h-40 bg-gray-100 flex items-center justify-center overflow-hidden">
                  {d.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.cover_url} alt={d.name} className="w-full h-full object-cover" />
                  ) : (
                    <Construction className="w-10 h-10 text-gray-300" />
                  )}
                  <span className={clsx('absolute top-2 left-2 text-xs font-medium px-2 py-1 rounded-full', CONSTRUCTION_STATUS_COLORS[d.construction_status])}>
                    {CONSTRUCTION_STATUS_LABELS[d.construction_status]}
                  </span>
                  {d.is_featured && (
                    <span className="absolute top-2 right-2 bg-gradient-to-br from-accent-300 to-accent-500 text-accent-900 rounded-full p-1 shadow-soft">
                      <Star className="w-3.5 h-3.5" fill="currentColor" />
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-400">{d.code}</span>
                    {d.builder_name && <span className="text-xs text-gray-400 truncate">{d.builder_name}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1 group-hover:text-brand-600 transition-colors">
                    {d.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-2 truncate">
                    {[d.neighborhood, d.city].filter(Boolean).join(', ') || '—'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {d.units_count ?? 0} unidade{d.units_count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
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
