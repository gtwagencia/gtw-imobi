'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Development, DevelopmentUnit, PropertyStatus } from '@/types';
import { STATUS_LABELS, formatCurrency, formatArea } from '@/lib/propertyConstants';
import {
  ArrowLeft, Loader2, Upload, X, Check, RotateCcw, ExternalLink, MapPin, Ban,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

const MARKER_COLORS: Record<PropertyStatus, string> = {
  disponivel: 'bg-green-500',
  reservado:  'bg-yellow-500',
  vendido:    'bg-blue-500',
  alugado:    'bg-indigo-500',
  inativo:    'bg-gray-400',
};

const MARKER_RING: Record<PropertyStatus, string> = {
  disponivel: 'ring-green-200',
  reservado:  'ring-yellow-200',
  vendido:    'ring-blue-200',
  alugado:    'ring-indigo-200',
  inativo:    'ring-gray-200',
};

export default function SalesMapPage() {
  const { currentWorkspace, user } = useAuth();
  const router = useRouter();
  const { developmentId } = useParams<{ developmentId: string }>();

  const [development,  setDevelopment]  = useState<Development | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<DevelopmentUnit | null>(null);
  const [placingMode,  setPlacingMode]  = useState(false);
  const [placingUnitId, setPlacingUnitId] = useState('');
  const [uploadingMap, setUploadingMap] = useState(false);
  const [reserveDate,  setReserveDate]  = useState('');
  const [saving,       setSaving]       = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/developments/${developmentId}`);
      setDevelopment(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, developmentId]);

  useEffect(() => { load(); }, [load]);

  async function handleMapImageUpload(file: File) {
    if (!currentWorkspace || !development) return;
    setUploadingMap(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<Development>(
        `/workspaces/${currentWorkspace.id}/developments/${development.id}/map-image`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setDevelopment(prev => prev ? { ...prev, map_image_url: data.map_image_url, map_config: data.map_config } : prev);
    } finally {
      setUploadingMap(false);
    }
  }

  async function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placingMode || !placingUnitId || !currentWorkspace) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round((((e.clientX - rect.left) / rect.width) * 100) * 100) / 100;
    const y = Math.round((((e.clientY - rect.top) / rect.height) * 100) * 100) / 100;

    await api.put(`/workspaces/${currentWorkspace.id}/properties/${placingUnitId}`, { mapShape: { x, y } });
    setDevelopment(prev => prev ? {
      ...prev,
      units: prev.units.map(u => u.id === placingUnitId ? { ...u, map_shape: { x, y } } : u),
    } : prev);
    setPlacingUnitId('');
    setPlacingMode(false);
  }

  async function applyStatus(status: PropertyStatus, reservedUntil?: string | null) {
    if (!currentWorkspace || !selected) return;
    setSaving(true);
    try {
      const body: { status: PropertyStatus; reservedUntil: string | null; reservedBy: string | null } = {
        status,
        reservedUntil: status === 'reservado' ? (reservedUntil || null) : null,
        reservedBy:    status === 'reservado' ? (user?.id || null) : null,
      };
      await api.put(`/workspaces/${currentWorkspace.id}/properties/${selected.id}`, body);
      setDevelopment(prev => prev ? {
        ...prev,
        units: prev.units.map(u => u.id === selected.id
          ? { ...u, status, reserved_until: body.reservedUntil, reserved_by: body.reservedBy }
          : u),
      } : prev);
      setSelected(prev => prev ? { ...prev, status, reserved_until: body.reservedUntil, reserved_by: body.reservedBy } : prev);
      setReserveDate('');
    } finally {
      setSaving(false);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Mapa de vendas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Mapa de vendas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </>
    );
  }

  if (!development) {
    return (
      <>
        <Header title="Mapa de vendas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Empreendimento não encontrado</div>
      </>
    );
  }

  const groups = development.units.reduce<Record<string, DevelopmentUnit[]>>((acc, u) => {
    const key = u.block_label || 'Sem quadra';
    (acc[key] ||= []).push(u);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Sem quadra') return 1;
    if (b === 'Sem quadra') return -1;
    return a.localeCompare(b, 'pt-BR');
  });

  const placableUnits = development.units.filter(u => !u.map_shape);

  return (
    <>
      <Header
        title={`Mapa de vendas · ${development.name}`}
        actions={
          <button className="btn-secondary text-sm" onClick={() => router.push(`/dashboard/developments/${development.id}`)}>
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Planta / mapa visual */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">Planta do loteamento</h3>
              <div className="flex items-center gap-2">
                {development.map_image_url && placableUnits.length > 0 && (
                  <>
                    <select
                      className="input text-sm w-auto"
                      value={placingUnitId}
                      onChange={(e) => { setPlacingUnitId(e.target.value); setPlacingMode(!!e.target.value); }}
                    >
                      <option value="">Posicionar lote no mapa...</option>
                      {placableUnits.map(u => (
                        <option key={u.id} value={u.id}>{u.lot_label || u.code} {u.block_label ? `(${u.block_label})` : ''}</option>
                      ))}
                    </select>
                    {placingMode && (
                      <span className="text-xs text-brand-600 font-medium whitespace-nowrap">Clique na planta para posicionar</span>
                    )}
                  </>
                )}
                <label className="btn-secondary text-sm cursor-pointer">
                  {uploadingMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {development.map_image_url ? 'Trocar planta' : 'Enviar planta'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingMap}
                    onChange={(e) => e.target.files?.[0] && handleMapImageUpload(e.target.files[0])}
                  />
                </label>
              </div>
            </div>

            {development.map_image_url ? (
              <div
                onClick={handleImageClick}
                className={clsx('relative w-full rounded-lg overflow-hidden border border-gray-200', placingMode ? 'cursor-crosshair' : '')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={development.map_image_url} alt="Planta do loteamento" className="w-full h-auto block select-none" draggable={false} />
                {development.units.filter(u => u.map_shape).map(u => (
                  <button
                    key={u.id}
                    onClick={(e) => { e.stopPropagation(); setSelected(u); setReserveDate(''); }}
                    title={`${u.lot_label || u.code}${u.block_label ? ` - ${u.block_label}` : ''}`}
                    style={{ left: `${u.map_shape!.x}%`, top: `${u.map_shape!.y}%` }}
                    className={clsx(
                      'absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow ring-2 transition-transform hover:scale-125',
                      MARKER_COLORS[u.status], MARKER_RING[u.status],
                      selected?.id === u.id && 'ring-4 scale-125'
                    )}
                  />
                ))}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                {uploadingMap ? <Loader2 className="w-8 h-8 text-brand-500 animate-spin" /> : <MapPin className="w-8 h-8 text-gray-400" />}
                <p className="text-sm font-medium text-gray-700">Envie a planta/imagem do loteamento</p>
                <p className="text-xs text-gray-400 text-center max-w-sm">
                  Depois você poderá posicionar cada lote sobre a imagem para visualizar o mapa de vendas.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingMap}
                  onChange={(e) => e.target.files?.[0] && handleMapImageUpload(e.target.files[0])}
                />
              </label>
            )}

            {/* Legenda */}
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
              {(['disponivel', 'reservado', 'vendido'] as PropertyStatus[]).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={clsx('w-2.5 h-2.5 rounded-full', MARKER_COLORS[s])} />
                  {STATUS_LABELS[s]}
                </div>
              ))}
            </div>
          </div>

          {/* Lotes por quadra */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Lotes ({development.units.length})</h3>
            {development.units.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Nenhuma unidade vinculada a este empreendimento ainda</div>
            ) : (
              <div className="space-y-5">
                {groupKeys.map(block => (
                  <div key={block}>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{block}</h4>
                    <div className="flex flex-wrap gap-2">
                      {groups[block].map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setSelected(u); setReserveDate(''); }}
                          className={clsx(
                            'flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left text-xs transition-colors min-w-[100px]',
                            selected?.id === u.id ? 'border-brand-400 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-300'
                          )}
                        >
                          <span className="flex items-center gap-1.5 font-medium text-gray-900">
                            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', MARKER_COLORS[u.status])} />
                            {u.lot_label || u.code}
                          </span>
                          <span className="text-gray-400">{formatArea(u.total_area)}</span>
                          <span className="text-gray-600">{formatCurrency(u.sale_price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Painel de detalhes do lote */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">{selected.lot_label || selected.code}</h3>
                {selected.block_label && <p className="text-xs text-gray-400">{selected.block_label}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Área</p>
                  <p className="font-medium text-gray-900">{formatArea(selected.total_area)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Valor</p>
                  <p className="font-medium text-gray-900">{formatCurrency(selected.sale_price)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="font-medium text-gray-900">{STATUS_LABELS[selected.status]}</p>
                </div>
                {selected.status === 'reservado' && selected.reserved_until && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">Reserva expira em</p>
                    <p className="font-medium text-gray-900">{format(new Date(selected.reserved_until), "dd/MM/yyyy 'às' HH:mm")}</p>
                  </div>
                )}
              </div>

              {/* Ações de status */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                {selected.status === 'disponivel' && (
                  <>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Reservar até (opcional)</label>
                    <div className="flex gap-2">
                      <input
                        type="datetime-local"
                        className="input text-sm flex-1"
                        value={reserveDate}
                        onChange={(e) => setReserveDate(e.target.value)}
                      />
                      <button
                        className="btn-primary text-sm"
                        disabled={saving}
                        onClick={() => applyStatus('reservado', reserveDate ? new Date(reserveDate).toISOString() : null)}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Reservar
                      </button>
                    </div>
                    <button className="btn-secondary text-sm w-full" disabled={saving} onClick={() => applyStatus('vendido')}>
                      <Check className="w-4 h-4" />
                      Marcar como vendido
                    </button>
                  </>
                )}

                {selected.status === 'reservado' && (
                  <>
                    <button className="btn-primary text-sm w-full" disabled={saving} onClick={() => applyStatus('vendido')}>
                      <Check className="w-4 h-4" />
                      Marcar como vendido
                    </button>
                    <button className="btn-secondary text-sm w-full" disabled={saving} onClick={() => applyStatus('disponivel')}>
                      <RotateCcw className="w-4 h-4" />
                      Cancelar reserva
                    </button>
                  </>
                )}

                {selected.status === 'vendido' && (
                  <button className="btn-secondary text-sm w-full" disabled={saving} onClick={() => applyStatus('disponivel')}>
                    <RotateCcw className="w-4 h-4" />
                    Disponibilizar novamente
                  </button>
                )}

                {(selected.status === 'alugado' || selected.status === 'inativo') && (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5" />
                    Altere o status na ficha completa do imóvel.
                  </p>
                )}
              </div>

              <button
                className="btn-secondary text-sm w-full mt-2"
                onClick={() => router.push(`/dashboard/properties/${selected.id}`)}
              >
                <ExternalLink className="w-4 h-4" />
                Ver ficha completa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
