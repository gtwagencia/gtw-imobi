'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '@/lib/propertyConstants';
import type { MapUnit } from './DevelopmentMap';

const STATUS_CONFIG = {
  disponivel: { label: 'Disponível',  color: '#22c55e', bg: 'bg-green-50',    border: 'border-green-300',  text: 'text-green-700'  },
  reservado:  { label: 'Reservado',   color: '#f59e0b', bg: 'bg-amber-50',    border: 'border-amber-300',  text: 'text-amber-700'  },
  vendido:    { label: 'Vendido',     color: '#ef4444', bg: 'bg-red-50',      border: 'border-red-200',    text: 'text-red-600'    },
  bloqueado:  { label: 'Bloqueado',   color: '#6366f1', bg: 'bg-violet-50',   border: 'border-violet-200', text: 'text-violet-600' },
  inativo:    { label: 'Inativo',     color: '#94a3b8', bg: 'bg-slate-50',    border: 'border-slate-200',  text: 'text-slate-400'  },
};

interface Props {
  units: MapUnit[];
  onUnitClick?: (unit: MapUnit) => void;
  readOnly?: boolean;
}

export default function BuildingFloorView({ units, onUnitClick }: Props) {
  const floors = [...new Set(units.map(u => u.unit_floor).filter(f => f !== null && f !== undefined) as number[])]
    .sort((a, b) => b - a);

  const [selectedFloor, setSelectedFloor] = useState<number | null>(floors[0] ?? null);

  const unitsOnFloor = selectedFloor !== null
    ? units.filter(u => u.unit_floor === selectedFloor)
    : units.filter(u => u.unit_floor === null || u.unit_floor === undefined);

  const stats = {
    disponivel: units.filter(u => u.status === 'disponivel').length,
    reservado:  units.filter(u => u.status === 'reservado').length,
    vendido:    units.filter(u => u.status === 'vendido').length,
  };

  return (
    <div className="flex h-full">
      {/* Seletor de andares */}
      <div className="w-24 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        <div className="p-2 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Andares</p>
          <div className="space-y-1">
            {floors.map(floor => {
              const floorUnits = units.filter(u => u.unit_floor === floor);
              const hasAvail   = floorUnits.some(u => u.status === 'disponivel');
              const allSold    = floorUnits.every(u => u.status === 'vendido');
              return (
                <button
                  key={floor}
                  onClick={() => setSelectedFloor(floor)}
                  className={clsx(
                    'w-full py-2 rounded-lg text-sm font-bold transition-all',
                    selectedFloor === floor
                      ? 'bg-brand-600 text-white shadow-sm'
                      : allSold
                        ? 'bg-red-50 text-red-500'
                        : hasAvail
                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                          : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                  )}
                >
                  {floor}º
                  <div className="text-xs font-normal opacity-70">{floorUnits.length} un.</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid de unidades do andar */}
      <div className="flex-1 overflow-auto p-4">
        {/* Stats */}
        <div className="flex items-center gap-4 mb-4">
          <h3 className="font-bold text-gray-900">
            {selectedFloor !== null ? `${selectedFloor}º Andar` : 'Unidades sem andar'}
          </h3>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-green-600 font-semibold">{stats.disponivel} disp.</span>
            <span className="text-xs text-amber-600 font-semibold">{stats.reservado} res.</span>
            <span className="text-xs text-red-600 font-semibold">{stats.vendido} vend.</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {unitsOnFloor.map(unit => {
            const cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.disponivel;
            return (
              <button
                key={unit.id}
                onClick={() => onUnitClick?.(unit)}
                className={clsx(
                  'text-left p-3 rounded-xl border-2 transition-all hover:shadow-md active:scale-95 group',
                  cfg.bg, cfg.border
                )}
              >
                <div className={clsx('text-lg font-black', cfg.text)}>
                  {unit.unit_number || unit.lot_label || unit.code}
                </div>
                <div className={clsx('text-xs mt-0.5', cfg.text, 'opacity-70')}>{cfg.label}</div>
                {unit.total_area && (
                  <div className="text-xs text-gray-400 mt-1">{unit.total_area} m²</div>
                )}
                {unit.sale_price && unit.status === 'disponivel' && (
                  <div className="text-xs font-semibold text-gray-700 mt-1 group-hover:text-brand-600 transition-colors">
                    {formatCurrency(unit.sale_price)}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {unitsOnFloor.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">Nenhuma unidade neste andar</p>
          </div>
        )}
      </div>
    </div>
  );
}
