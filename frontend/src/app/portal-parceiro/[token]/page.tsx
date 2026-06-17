'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Building2, Loader2, Map, ArrowLeft, Home, CheckCircle, Clock, Ban } from 'lucide-react';
import DevelopmentMap, { MapUnit } from '@/components/developments/DevelopmentMap';
import BuildingFloorView from '@/components/developments/BuildingFloorView';
import ProposalModalPortal from '@/components/developments/ProposalModalPortal';
import clsx from 'clsx';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/$/, '');

interface PortalUser { id: string; name: string; role: string; agencyName: string; workspaceId: string }
interface Development {
  id: string; code: string; name: string; development_type: string | null;
  city: string | null; state: string | null; map_image_url: string | null;
  map_config: Record<string,number> | null; cover_url: string | null;
  units_disponivel: number; units_reservado: number;
}

const DEV_TYPE_LABELS: Record<string, string> = {
  loteamento: 'Loteamento', condominio_fechado: 'Condomínio Fechado',
  predio: 'Prédio', comercial: 'Comercial',
};

async function apiFetch(path: string) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error('Erro na requisição');
  return res.json();
}

export default function PortalParceiro() {
  const { token } = useParams<{ token: string }>();
  const [user,       setUser]       = useState<PortalUser | null>(null);
  const [devs,       setDevs]       = useState<Development[]>([]);
  const [selDev,     setSelDev]     = useState<Development | null>(null);
  const [units,      setUnits]      = useState<MapUnit[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingU,   setLoadingU]   = useState(false);
  const [error,      setError]      = useState('');
  const [propUnit,   setPropUnit]   = useState<MapUnit | null>(null);
  const [success,    setSuccess]    = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch(`/portal-parceiro/${token}`),
      apiFetch(`/portal-parceiro/${token}/empreendimentos`),
    ])
      .then(([u, d]) => { setUser(u); setDevs(d); })
      .catch(() => setError('Link inválido ou expirado. Entre em contato com a incorporadora.'))
      .finally(() => setLoading(false));
  }, [token]);

  const loadUnits = useCallback(async (devId: string) => {
    setLoadingU(true);
    try {
      const data = await apiFetch(`/portal-parceiro/${token}/empreendimentos/${devId}/unidades`);
      setUnits(data);
    } finally { setLoadingU(false); }
  }, [token]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
    </div>
  );

  if (error || !user) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <Ban className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Portal indisponível</h1>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        {selDev && (
          <button onClick={() => { setSelDev(null); setUnits([]); }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 text-sm truncate">
            {selDev ? selDev.name : 'Portal Parceiro'}
          </h1>
          <p className="text-xs text-gray-500 truncate">
            {selDev
              ? (DEV_TYPE_LABELS[selDev.development_type || ''] || '')
              : `${user.name} · ${user.agencyName}`}
          </p>
        </div>
        {selDev && (
          <div className="flex items-center gap-3 text-xs flex-shrink-0">
            <span className="text-green-600 font-semibold">{units.filter(u => u.status === 'disponivel').length} disp.</span>
            <span className="text-amber-500 font-semibold">{units.filter(u => u.status === 'reservado').length} res.</span>
            <span className="text-red-500 font-semibold">{units.filter(u => u.status === 'vendido').length} vend.</span>
          </div>
        )}
      </div>

      {/* Sucesso */}
      {success && (
        <div className="bg-green-500 text-white text-sm text-center px-4 py-3 flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Lista de empreendimentos */}
      {!selDev && (
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wider">Empreendimentos disponíveis</p>
          {devs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum empreendimento disponível para você no momento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devs.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => { setSelDev(dev); loadUnits(dev.id); }}
                  className="w-full card p-0 overflow-hidden text-left hover:shadow-md transition-shadow flex"
                >
                  <div className="w-28 h-24 flex-shrink-0 bg-gray-100 relative overflow-hidden">
                    {dev.cover_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={dev.cover_url} alt={dev.name} className="w-full h-full object-cover" />
                      : <Building2 className="w-8 h-8 text-gray-300 absolute inset-0 m-auto" />
                    }
                  </div>
                  <div className="flex-1 p-3 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm leading-tight">{dev.name}</h3>
                        {(dev.city || dev.state) && (
                          <p className="text-xs text-gray-500 mt-0.5">{[dev.city, dev.state].filter(Boolean).join(' · ')}</p>
                        )}
                        {dev.development_type && (
                          <span className="text-xs text-gray-400">{DEV_TYPE_LABELS[dev.development_type] || dev.development_type}</span>
                        )}
                      </div>
                      <Map className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className={clsx('font-semibold flex items-center gap-1', dev.units_disponivel > 0 ? 'text-green-600' : 'text-gray-400')}>
                        <CheckCircle className="w-3 h-3" /> {dev.units_disponivel} disponíveis
                      </span>
                      {dev.units_reservado > 0 && (
                        <span className="text-amber-500 font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {dev.units_reservado} reservadas
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="mt-10 text-center">
            <Home className="w-3 h-3 inline-block text-gray-300 mr-1" />
            <span className="text-xs text-gray-300">Portal exclusivo — acesso autorizado</span>
          </div>
        </div>
      )}

      {/* Mapa / Andares */}
      {selDev && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {selDev.development_type !== 'predio' && (
            <p className="text-xs text-gray-400 text-center py-1.5 bg-gray-50 border-b border-gray-200">
              Toque em uma unidade <span className="text-green-600 font-semibold">verde</span> para enviar uma proposta
            </p>
          )}
          {loadingU ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </div>
          ) : selDev.development_type === 'predio' ? (
            <BuildingFloorView
              units={units}
              readOnly
              onUnitClick={u => { if (u.status === 'disponivel') setPropUnit(u); }}
            />
          ) : (
            <DevelopmentMap
              units={units}
              mapImageUrl={selDev.map_image_url}
              mapConfig={selDev.map_config}
              readOnly
              onUnitClick={u => { if (u.status === 'disponivel') setPropUnit(u); }}
            />
          )}
        </div>
      )}

      {/* Modal de proposta */}
      {propUnit && selDev && (
        <ProposalModalPortal
          unit={propUnit}
          developmentId={selDev.id}
          brokerToken={token}
          onClose={() => setPropUnit(null)}
          onSuccess={() => {
            setPropUnit(null);
            setSuccess('Proposta enviada! A incorporadora vai analisar e entrar em contato em breve.');
            loadUnits(selDev.id);
            setTimeout(() => setSuccess(''), 7000);
          }}
          apiPath="portal-parceiro"
          proposalPath="propostas"
        />
      )}
    </div>
  );
}
