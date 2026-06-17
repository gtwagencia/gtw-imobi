'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import {
  X, ZoomIn, ZoomOut, Maximize2, Info, Tag, Calendar,
  DollarSign, Ruler, MapPin, CheckCircle, Clock, Ban, AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/propertyConstants';

export interface MapUnit {
  id: string;
  code: string;
  title: string;
  status: 'disponivel' | 'reservado' | 'vendido' | 'bloqueado' | 'inativo';
  sale_price: number | null;
  total_area: number | null;
  block_label: string | null;
  lot_label: string | null;
  unit_number: string | null;
  unit_floor: number | null;
  price_zone: string | null;
  area_front: number | null;
  area_depth: number | null;
  reserved_until: string | null;
  map_shape: { points?: number[][]; type?: string; x?: number; y?: number; width?: number; height?: number } | null;
}

interface Props {
  units: MapUnit[];
  mapImageUrl: string | null;
  mapConfig: { width?: number; height?: number } | null;
  onUnitClick?: (unit: MapUnit) => void;
  onUnitStatusChange?: (unitId: string, status: string) => void;
  readOnly?: boolean;
}

const STATUS_CONFIG = {
  disponivel: { label: 'Disponível',  color: '#22c55e', bg: 'bg-green-500',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700',  icon: CheckCircle },
  reservado:  { label: 'Reservado',   color: '#f59e0b', bg: 'bg-amber-500',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  icon: Clock       },
  vendido:    { label: 'Vendido',     color: '#ef4444', bg: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',      icon: Ban         },
  bloqueado:  { label: 'Bloqueado',   color: '#6366f1', bg: 'bg-violet-500', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700',icon: AlertCircle },
  inativo:    { label: 'Inativo',     color: '#94a3b8', bg: 'bg-slate-400',  text: 'text-slate-500',  badge: 'bg-slate-100 text-slate-500',  icon: Ban         },
};

function getPolygonPoints(shape: MapUnit['map_shape'], imgW: number, imgH: number, refW: number, refH: number): string {
  if (!shape) return '';
  const scaleX = imgW / refW;
  const scaleY = imgH / refH;

  if (shape.type === 'rect' && shape.x !== undefined) {
    const x = shape.x * scaleX, y = shape.y! * scaleY;
    const w = shape.width! * scaleX, h = shape.height! * scaleY;
    return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
  }
  if (shape.points) {
    return shape.points.map(([px, py]) => `${px * scaleX},${py * scaleY}`).join(' ');
  }
  return '';
}

export default function DevelopmentMap({ units, mapImageUrl, mapConfig, onUnitClick, onUnitStatusChange, readOnly }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const [imgSize,    setImgSize]    = useState({ w: 0, h: 0 });
  const [zoom,       setZoom]       = useState(1);
  const [pan,        setPan]        = useState({ x: 0, y: 0 });
  const [panning,    setPanning]    = useState(false);
  const [panStart,   setPanStart]   = useState({ x: 0, y: 0 });
  const [selected,   setSelected]   = useState<MapUnit | null>(null);
  const [hovered,    setHovered]    = useState<string | null>(null);

  const refW = mapConfig?.width  || 1200;
  const refH = mapConfig?.height || 800;

  const onImgLoad = useCallback(() => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
    }
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (imgRef.current) setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
    });
    if (imgRef.current) obs.observe(imgRef.current);
    return () => obs.disconnect();
  }, []);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(0.3, z - e.deltaY * 0.001)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!panning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }
  function handleMouseUp() { setPanning(false); }

  const unitsWithShape = units.filter(u => u.map_shape);
  const unitsWithoutShape = units.filter(u => !u.map_shape);

  const stats = {
    total:      units.length,
    disponivel: units.filter(u => u.status === 'disponivel').length,
    reservado:  units.filter(u => u.status === 'reservado').length,
    vendido:    units.filter(u => u.status === 'vendido').length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex-wrap">
        {[
          { key: 'total',      label: 'Total',      val: stats.total,      color: 'text-gray-700' },
          { key: 'disponivel', label: 'Disponíveis', val: stats.disponivel, color: 'text-green-600' },
          { key: 'reservado',  label: 'Reservados', val: stats.reservado,  color: 'text-amber-600' },
          { key: 'vendido',    label: 'Vendidos',   val: stats.vendido,    color: 'text-red-600'   },
        ].map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={clsx('text-xl font-bold', s.color)}>{s.val}</span>
            <span className="text-xs text-gray-500">{s.label}</span>
            {s.key !== 'total' && (
              <span className="text-xs text-gray-300">
                ({stats.total > 0 ? Math.round(s.val / stats.total * 100) : 0}%)
              </span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Legenda */}
          {Object.entries(STATUS_CONFIG).slice(0,4).map(([k, cfg]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: cfg.color }} />
              <span className="text-xs text-gray-500 hidden sm:inline">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Mapa */}
        <div className="flex-1 overflow-hidden relative bg-gray-100">
          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="w-8 h-8 bg-white border border-gray-200 rounded-lg shadow flex items-center justify-center hover:bg-gray-50">
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.25))} className="w-8 h-8 bg-white border border-gray-200 rounded-lg shadow flex items-center justify-center hover:bg-gray-50">
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-8 h-8 bg-white border border-gray-200 rounded-lg shadow flex items-center justify-center hover:bg-gray-50">
              <Maximize2 className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>

          {mapImageUrl ? (
            <div
              ref={containerRef}
              className={clsx('w-full h-full overflow-hidden', panning ? 'cursor-grabbing' : 'cursor-grab')}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', transition: panning ? 'none' : 'transform 0.1s' }}
                className="relative inline-block"
              >
                <img
                  ref={imgRef}
                  src={mapImageUrl}
                  alt="Planta do empreendimento"
                  className="block max-w-none select-none"
                  style={{ maxWidth: '100%' }}
                  onLoad={onImgLoad}
                  draggable={false}
                />
                {/* SVG overlay */}
                {imgSize.w > 0 && (
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    width={imgSize.w}
                    height={imgSize.h}
                    viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                  >
                    {unitsWithShape.map(unit => {
                      const pts = getPolygonPoints(unit.map_shape, imgSize.w, imgSize.h, refW, refH);
                      if (!pts) return null;
                      const cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.disponivel;
                      const isHovered  = hovered === unit.id;
                      const isSelected = selected?.id === unit.id;
                      return (
                        <polygon
                          key={unit.id}
                          points={pts}
                          fill={cfg.color}
                          fillOpacity={isSelected ? 0.85 : isHovered ? 0.7 : 0.5}
                          stroke={isSelected ? '#1e293b' : cfg.color}
                          strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                          className="pointer-events-auto cursor-pointer transition-all"
                          onMouseEnter={() => setHovered(unit.id)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => {
                            setSelected(unit);
                            onUnitClick?.(unit);
                          }}
                        />
                      );
                    })}
                    {/* Labels dos lotes no mapa */}
                    {unitsWithShape.map(unit => {
                      if (!unit.map_shape?.points) return null;
                      const pts = unit.map_shape.points;
                      if (!pts.length) return null;
                      const scaleX = imgSize.w / refW, scaleY = imgSize.h / refH;
                      const cx = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * scaleX;
                      const cy = (pts.reduce((s, p) => s + p[1], 0) / pts.length) * scaleY;
                      const label = unit.lot_label || unit.unit_number || '';
                      return (
                        <text
                          key={`lbl-${unit.id}`}
                          x={cx} y={cy}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={Math.max(8, Math.min(12, imgSize.w / 80))}
                          fontWeight="600"
                          fill="white"
                          stroke="#00000044"
                          strokeWidth="0.5"
                          className="pointer-events-none select-none"
                        >
                          {label}
                        </text>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <MapPin className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-gray-400 font-medium">Nenhuma planta cadastrada</p>
              <p className="text-xs text-gray-300 mt-1">Faça upload da planta do empreendimento para habilitar o mapa interativo</p>
            </div>
          )}
        </div>

        {/* Painel lateral da unidade selecionada */}
        {selected && (
          <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <div className="font-bold text-gray-900 text-sm">{selected.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">{selected.code}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 text-gray-300 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Status */}
              {(() => {
                const cfg = STATUS_CONFIG[selected.status] || STATUS_CONFIG.disponivel;
                const Icon = cfg.icon;
                return (
                  <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold', cfg.badge)}>
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                    {selected.status === 'reservado' && selected.reserved_until && (
                      <span className="ml-auto text-xs font-normal opacity-70">
                        até {new Date(selected.reserved_until).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Info */}
              <div className="space-y-2.5">
                {selected.block_label && (
                  <Row icon={<Tag className="w-3.5 h-3.5" />} label="Quadra" value={selected.block_label} />
                )}
                {selected.lot_label && (
                  <Row icon={<Info className="w-3.5 h-3.5" />} label="Lote" value={selected.lot_label} />
                )}
                {selected.unit_floor !== null && selected.unit_floor !== undefined && (
                  <Row icon={<Info className="w-3.5 h-3.5" />} label="Andar" value={`${selected.unit_floor}º`} />
                )}
                {selected.unit_number && (
                  <Row icon={<Info className="w-3.5 h-3.5" />} label="Unidade" value={selected.unit_number} />
                )}
                {selected.total_area && (
                  <Row icon={<Ruler className="w-3.5 h-3.5" />} label="Área total" value={`${selected.total_area} m²`} />
                )}
                {selected.area_front && (
                  <Row icon={<Ruler className="w-3.5 h-3.5" />} label="Frente" value={`${selected.area_front} m`} />
                )}
                {selected.area_depth && (
                  <Row icon={<Ruler className="w-3.5 h-3.5" />} label="Fundo" value={`${selected.area_depth} m`} />
                )}
                {selected.sale_price && (
                  <Row icon={<DollarSign className="w-3.5 h-3.5" />} label="Preço" value={formatCurrency(selected.sale_price)} highlight />
                )}
                {selected.price_zone && (
                  <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Zona" value={selected.price_zone} />
                )}
              </div>

              {/* Ações */}
              {!readOnly && selected.status === 'disponivel' && (
                <div className="pt-2 space-y-2">
                  <button
                    onClick={() => onUnitClick?.(selected)}
                    className="btn-primary w-full text-sm"
                  >
                    Fazer proposta
                  </button>
                  <button
                    onClick={() => onUnitStatusChange?.(selected.id, 'bloqueado')}
                    className="btn-secondary w-full text-sm"
                  >
                    Bloquear unidade
                  </button>
                </div>
              )}
              {!readOnly && selected.status === 'bloqueado' && (
                <button
                  onClick={() => onUnitStatusChange?.(selected.id, 'disponivel')}
                  className="btn-secondary w-full text-sm mt-2"
                >
                  Desbloquear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid de unidades sem mapa (abaixo ou quando não tem mapa) */}
      {unitsWithoutShape.length > 0 && (
        <div className="border-t border-gray-200 bg-white p-4 max-h-64 overflow-y-auto">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Unidades sem posição no mapa ({unitsWithoutShape.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {unitsWithoutShape.map(unit => {
              const cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.disponivel;
              return (
                <button
                  key={unit.id}
                  onClick={() => { setSelected(unit); onUnitClick?.(unit); }}
                  className={clsx(
                    'text-left p-2 rounded-lg border-2 transition-all hover:shadow-sm text-xs',
                    selected?.id === unit.id ? 'border-gray-900' : 'border-transparent',
                  )}
                  style={{ background: cfg.color + '20', borderColor: selected?.id === unit.id ? cfg.color : 'transparent' }}
                >
                  <div className="font-bold text-gray-800 truncate">
                    {unit.block_label && `${unit.block_label} `}{unit.lot_label || unit.unit_number || unit.code}
                  </div>
                  <div className="text-gray-500 mt-0.5" style={{ color: cfg.color }}>{cfg.label}</div>
                  {unit.sale_price && <div className="text-gray-600 font-medium mt-0.5">{formatCurrency(unit.sale_price)}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className="text-xs text-gray-400 flex-shrink-0 w-16">{label}</span>
      <span className={clsx('text-sm font-semibold flex-1 text-right', highlight ? 'text-brand-600' : 'text-gray-800')}>
        {value}
      </span>
    </div>
  );
}
