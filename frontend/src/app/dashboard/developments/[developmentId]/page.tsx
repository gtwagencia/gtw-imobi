'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import DevelopmentForm from '@/components/properties/DevelopmentForm';
import MediaGallery, { GalleryMediaItem } from '@/components/properties/MediaGallery';
import LoteamentoImportWizard from '@/components/properties/LoteamentoImportWizard';
import DevelopmentMap, { MapUnit } from '@/components/developments/DevelopmentMap';
import BuildingFloorView from '@/components/developments/BuildingFloorView';
import ProposalModal from '@/components/developments/ProposalModal';
import CsvImportModal from '@/components/developments/CsvImportModal';
import PriceAdjustModal from '@/components/developments/PriceAdjustModal';
import UnitEditModal from '@/components/developments/UnitEditModal';
import api from '@/lib/api';
import type { Development, DevelopmentMedia } from '@/types';
import { CONSTRUCTION_STATUS_COLORS, CONSTRUCTION_STATUS_LABELS, formatCurrency } from '@/lib/propertyConstants';
import {
  ArrowLeft, Trash2, Loader2, Building2, FileUp, Map, HardHat,
  TrendingUp, CheckCircle, Clock, Ban, AlertCircle,
  FileSpreadsheet, Plus, Edit2, X, Check, DollarSign,
  Users, BarChart3, Home, Layers, ImagePlus, Link, Copy,
} from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/store/toast';

type Tab = 'overview' | 'map' | 'proposals' | 'zones';

const DEV_TYPE_LABELS: Record<string, string> = {
  loteamento:       'Loteamento',
  condominio_fechado: 'Condomínio Fechado',
  predio:           'Prédio / Apartamentos',
  comercial:        'Comercial',
};

const PROPOSAL_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:   { label: 'Aguardando',  color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: Clock       },
  approved:  { label: 'Aprovada',    color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: CheckCircle },
  rejected:  { label: 'Rejeitada',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       icon: Ban         },
  expired:   { label: 'Expirada',    color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',     icon: AlertCircle },
  converted: { label: 'Convertida',  color: 'text-brand-700',  bg: 'bg-brand-50 border-brand-200',   icon: CheckCircle },
};

const MODIFIER_TYPE_LABELS: Record<string, string> = {
  per_m2:   'R$/m²',
  fixed:    'Preço fixo',
  percent:  '% sobre base',
};

interface PriceZone {
  id: string; name: string; description: string | null;
  modifier_type: string; modifier_value: number;
  color: string; units_count: number;
}

interface Proposal {
  id: string; status: string; buyer_name: string; partner_agency: string | null;
  partner_broker: string | null; proposed_price: number; payment_type: string;
  expires_at: string; created_at: string; property_title: string; property_code: string;
  block_label: string | null; lot_label: string | null; unit_number: string | null;
  rejection_reason: string | null;
}

export default function DevelopmentDetailPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();
  const showToast = useToast(s => s.show);
  const { developmentId } = useParams<{ developmentId: string }>();

  const [tab, setTab] = useState<Tab>('overview');
  const [development, setDevelopment] = useState<Development | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [deleting,  setDeleting]  = useState(false);
  const [uploading, setUploading] = useState(false);

  // Map / Units
  const [units,        setUnits]        = useState<MapUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [zones,        setZones]        = useState<PriceZone[]>([]);

  // Proposals
  const [proposals,        setProposals]        = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalFilter,   setProposalFilter]   = useState('pending');
  const [reviewingId,      setReviewingId]      = useState<string | null>(null);

  // Modals
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showCsvModal,     setShowCsvModal]     = useState(false);
  const [showPriceModal,   setShowPriceModal]   = useState(false);
  const [proposalUnit,     setProposalUnit]     = useState<MapUnit | null>(null);
  const [editUnit,         setEditUnit]         = useState<MapUnit | null>(null);
  const [uploadingMap,     setUploadingMap]     = useState(false);

  // Price zones
  const [editingZone,  setEditingZone]  = useState<PriceZone | null>(null);
  const [zoneForm,     setZoneForm]     = useState({ name: '', description: '', modifier_type: 'per_m2', modifier_value: '', color: '#3b82f6' });
  const [savingZone,   setSavingZone]   = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);

  const wsId = currentWorkspace?.id;

  const load = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${wsId}/developments/${developmentId}`);
      setDevelopment(data);
    } finally { setLoading(false); }
  }, [wsId, developmentId]);

  const loadUnits = useCallback(async () => {
    if (!wsId) return;
    setUnitsLoading(true);
    try {
      const [{ data: uData }, { data: zData }] = await Promise.all([
        api.get(`/workspaces/${wsId}/developments/${developmentId}/units?limit=500`),
        api.get(`/workspaces/${wsId}/developments/${developmentId}/price-zones`),
      ]);
      setUnits(uData.data || []);
      setZones(zData || []);
    } finally { setUnitsLoading(false); }
  }, [wsId, developmentId]);

  const loadProposals = useCallback(async () => {
    if (!wsId) return;
    setProposalsLoading(true);
    try {
      const { data } = await api.get(
        `/workspaces/${wsId}/developments/${developmentId}/proposals?status=${proposalFilter}&limit=50`
      );
      setProposals(data.data || []);
    } finally { setProposalsLoading(false); }
  }, [wsId, developmentId, proposalFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'map')       loadUnits();     }, [tab, loadUnits]);
  useEffect(() => { if (tab === 'zones')     loadUnits();     }, [tab, loadUnits]);
  useEffect(() => { if (tab === 'proposals') loadProposals(); }, [tab, loadProposals, proposalFilter]);

  async function handleDelete() {
    if (!wsId || !development) return;
    if (!confirm(`Excluir "${development.name}"? Ação irreversível.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${wsId}/developments/${development.id}`);
      router.push('/dashboard/empreendimentos');
    } finally { setDeleting(false); }
  }

  async function handleUpload(files: FileList) {
    if (!wsId || !development) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append('file', file);
        const { data } = await api.post<DevelopmentMedia>(
          `/workspaces/${wsId}/developments/${development.id}/media`, fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setDevelopment(prev => prev ? { ...prev, media: [...prev.media, data] } : prev);
      }
    } finally { setUploading(false); }
  }

  async function handleRemoveMedia(mediaId: string) {
    if (!wsId || !development || !confirm('Remover mídia?')) return;
    await api.delete(`/workspaces/${wsId}/developments/${development.id}/media/${mediaId}`);
    load();
  }

  async function handleSetCover(mediaId: string) {
    if (!wsId || !development) return;
    await api.put(`/workspaces/${wsId}/developments/${development.id}/media/${mediaId}/cover`, {});
    setDevelopment(prev => prev ? { ...prev, media: prev.media.map(m => ({ ...m, is_cover: m.id === mediaId })) } : prev);
  }

  async function handleToggleShowOnSite(mediaId: string, showOnSite: boolean) {
    if (!wsId || !development) return;
    await api.put(`/workspaces/${wsId}/developments/${development.id}/media/${mediaId}/show-on-site`, { showOnSite });
    setDevelopment(prev => prev ? { ...prev, media: prev.media.map(m => m.id === mediaId ? { ...m, show_on_site: showOnSite } : m) } : prev);
  }

  async function handleReorder(orderedMedia: GalleryMediaItem[]) {
    if (!wsId || !development) return;
    setDevelopment({ ...development, media: orderedMedia as DevelopmentMedia[] });
    await api.put(`/workspaces/${wsId}/developments/${development.id}/media/reorder`, {
      mediaIds: orderedMedia.map(m => m.id),
    }).catch(() => load());
  }

  async function handleMapImageUpload(file: File) {
    if (!wsId || !development) return;
    setUploadingMap(true);
    try {
      let uploadFile: File | Blob = file;

      // PDF → converte primeira página para PNG no browser
      if (file.type === 'application/pdf') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const buf  = await file.arrayBuffer();
        const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const vp   = page.getViewport({ scale: 2.5 }); // alta resolução
        const canvas = document.createElement('canvas');
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        uploadFile = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
      }

      const fd = new FormData();
      fd.append('file', uploadFile, file.name.replace(/\.pdf$/i, '.png'));
      const { data } = await api.post(`/workspaces/${wsId}/developments/${development.id}/map-image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDevelopment(prev => prev ? { ...prev, map_image_url: data.map_image_url } : prev);
      showToast('Planta carregada com sucesso');
    } catch {
      showToast('Erro ao enviar a planta', 'error');
    } finally { setUploadingMap(false); }
  }

  async function handleUnitStatusChange(unitId: string, status: string) {
    if (!wsId) return;
    await api.put(`/workspaces/${wsId}/developments/${developmentId}/units/${unitId}`, { status });
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, status: status as MapUnit['status'] } : u));
    showToast('Status atualizado');
  }

  async function handleApprove(proposalId: string) {
    if (!wsId || !confirm('Aprovar esta proposta? A unidade será marcada como VENDIDA.')) return;
    setReviewingId(proposalId);
    try {
      await api.post(`/workspaces/${wsId}/developments/${developmentId}/proposals/${proposalId}/approve`);
      showToast('Proposta aprovada — unidade marcada como vendida');
      loadProposals();
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro', 'error');
    } finally { setReviewingId(null); }
  }

  async function handleReject(proposalId: string) {
    const reason = prompt('Motivo da rejeição (opcional):');
    if (reason === null) return;
    if (!wsId) return;
    setReviewingId(proposalId);
    try {
      await api.post(`/workspaces/${wsId}/developments/${developmentId}/proposals/${proposalId}/reject`, { reason });
      showToast('Proposta rejeitada — unidade liberada');
      loadProposals();
    } finally { setReviewingId(null); }
  }

  async function handleSaveZone(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setSavingZone(true);
    try {
      if (editingZone) {
        await api.put(`/workspaces/${wsId}/developments/${developmentId}/price-zones/${editingZone.id}`, {
          name: zoneForm.name, description: zoneForm.description,
          modifierType: zoneForm.modifier_type, modifierValue: parseFloat(zoneForm.modifier_value), color: zoneForm.color,
        });
        showToast('Zona atualizada');
      } else {
        await api.post(`/workspaces/${wsId}/developments/${developmentId}/price-zones`, {
          name: zoneForm.name, description: zoneForm.description,
          modifierType: zoneForm.modifier_type, modifierValue: parseFloat(zoneForm.modifier_value), color: zoneForm.color,
        });
        showToast('Zona criada');
      }
      setShowZoneForm(false); setEditingZone(null);
      loadUnits();
    } finally { setSavingZone(false); }
  }

  async function handleDeleteZone(zoneId: string) {
    if (!wsId || !confirm('Excluir esta zona?')) return;
    await api.delete(`/workspaces/${wsId}/developments/${developmentId}/price-zones/${zoneId}`);
    showToast('Zona excluída');
    loadUnits();
  }

  async function handleApplyZone(zoneName: string) {
    if (!wsId || !confirm(`Aplicar precificação da zona "${zoneName}" a todas as suas unidades?`)) return;
    const zone = zones.find(z => z.name === zoneName);
    if (!zone) return;
    const { data } = await api.post(
      `/workspaces/${wsId}/developments/${developmentId}/price-zones/${zone.id}/apply`, {}
    );
    showToast(`${data.updated} unidades atualizadas`);
    loadUnits();
  }

  const blocks = [...new Set(units.map(u => u.block_label).filter(Boolean) as string[])].sort();
  const isBuilding = development?.development_type === 'predio';

  if (!wsId) return <><Header title="Empreendimento" /><div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div></>;
  if (loading) return <><Header title="Empreendimento" /><div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div></>;
  if (!development) return <><Header title="Empreendimento" /><div className="flex-1 flex items-center justify-center text-gray-400">Não encontrado</div></>;

  const devType = development.development_type || 'loteamento';

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',   label: 'Visão Geral',    icon: Home      },
    { key: 'map',        label: isBuilding ? 'Andares & Unidades' : 'Mapa & Lotes', icon: Map },
    { key: 'proposals',  label: 'Propostas',       icon: Users     },
    { key: 'zones',      label: 'Zonas de Preço',  icon: Layers    },
  ];

  return (
    <>
      <Header
        title={`${development.code} · ${development.name}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-xs font-medium px-2 py-1 rounded-full', CONSTRUCTION_STATUS_COLORS[development.construction_status])}>
              {CONSTRUCTION_STATUS_LABELS[development.construction_status]}
            </span>
            {devType && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                {DEV_TYPE_LABELS[devType] || devType}
              </span>
            )}
            <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/empreendimentos')}>
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button
              className="btn-secondary text-sm"
              onClick={() => router.push(`/dashboard/empreendimentos/${development.id}/construction`)}
            >
              <HardHat className="w-4 h-4" /> Obra
            </button>
            <button className="btn-secondary text-sm text-red-600 hover:bg-red-50" disabled={deleting} onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 gap-0.5 flex-shrink-0 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
              tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── TAB: Visão Geral ──────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Cards de stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total de unidades', value: development.units.length, icon: Building2, color: 'text-gray-700', bg: 'bg-gray-50' },
                { label: 'Disponíveis',  value: development.units.filter(u => u.status === 'disponivel').length,  icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50'  },
                { label: 'Reservadas',   value: development.units.filter(u => u.status === 'reservado').length,   icon: Clock,       color: 'text-amber-600',  bg: 'bg-amber-50'  },
                { label: 'Vendidas',     value: development.units.filter(u => u.status === 'vendido').length,     icon: BarChart3,   color: 'text-red-600',    bg: 'bg-red-50'    },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className={clsx('card p-4 flex items-center gap-3', s.bg)}>
                    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/80 shadow-sm')}>
                      <Icon className={clsx('w-5 h-5', s.color)} />
                    </div>
                    <div>
                      <div className={clsx('text-xl font-black', s.color)}>{s.value}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Galeria */}
            <MediaGallery
              media={development.media}
              uploading={uploading}
              onUpload={handleUpload}
              onRemove={handleRemoveMedia}
              onSetCover={handleSetCover}
              onToggleShowOnSite={handleToggleShowOnSite}
              onReorder={handleReorder}
            />

            {/* Formulário de edição */}
            <DevelopmentForm
              development={development}
              workspaceId={wsId}
              onSave={saved => setDevelopment(prev => prev ? { ...prev, ...saved, media: prev.media, units: prev.units } : prev)}
            />
          </div>
        </div>
      )}

      {/* ── TAB: Mapa & Unidades ─────────────────────────────────────────── */}
      {tab === 'map' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 flex-wrap">
            <button onClick={() => setShowCsvModal(true)} className="btn-secondary btn-sm">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Importar CSV
            </button>
            <button onClick={() => setShowPriceModal(true)} className="btn-secondary btn-sm">
              <TrendingUp className="w-3.5 h-3.5" /> Ajustar preços
            </button>
            <button onClick={() => setShowImportWizard(true)} className="btn-secondary btn-sm">
              <FileUp className="w-3.5 h-3.5" /> Importar PDF (IA)
            </button>
            <button
              onClick={() => router.push(`/dashboard/imoveis/novo?developmentId=${development.id}`)}
              className="btn-secondary btn-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Unidade manual
            </button>
            {/* Upload de planta */}
            <label
              className={`btn-sm cursor-pointer flex items-center gap-1.5 ${!development.map_image_url ? 'btn-primary' : 'btn-secondary'}`}
              title="Envie a planta do loteamento ou planta baixa (imagem ou PDF)"
            >
              {uploadingMap
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando...</>
                : <><ImagePlus className="w-3.5 h-3.5" />{!development.map_image_url ? '📄 Carregar planta (PDF ou imagem)' : 'Trocar planta'}</>
              }
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleMapImageUpload(f); }}
              />
            </label>
            <button
              onClick={() => {
                const url = `${window.location.origin}/portal-corretor/`;
                navigator.clipboard.writeText(url).then(() => showToast('Prefixo do portal copiado — cole o token do corretor no final'));
              }}
              className="btn-secondary btn-sm"
              title="Copiar link do portal de corretores"
            >
              <Link className="w-3.5 h-3.5" /> Link portal
            </button>
            <button onClick={loadUnits} className="btn-secondary btn-sm ml-auto">
              <Loader2 className={clsx('w-3.5 h-3.5', unitsLoading && 'animate-spin')} />
            </button>
          </div>

          {/* Mapa ou Prédio */}
          {unitsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </div>
          ) : isBuilding ? (
            <BuildingFloorView
              units={units}
              onUnitClick={unit => {
                if (unit.status === 'disponivel') setProposalUnit(unit);
                else setEditUnit(unit);
              }}
            />
          ) : (
            <DevelopmentMap
              units={units}
              mapImageUrl={development.map_image_url}
              mapConfig={development.map_config as Record<string,number> || null}
              onUnitClick={unit => {
                if (unit.status === 'disponivel') setProposalUnit(unit);
                else setEditUnit(unit);
              }}
              onUnitStatusChange={handleUnitStatusChange}
            />
          )}
        </div>
      )}

      {/* ── TAB: Propostas ───────────────────────────────────────────────── */}
      {tab === 'proposals' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-4xl mx-auto">
            {/* Filtro por status */}
            <div className="flex gap-2 mb-5 overflow-x-auto">
              {['pending', 'approved', 'rejected', 'expired'].map(s => {
                const cfg = PROPOSAL_STATUS_CONFIG[s];
                const Icon = cfg.icon;
                return (
                  <button
                    key={s}
                    onClick={() => setProposalFilter(s)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap',
                      proposalFilter === s ? `border-2 ${cfg.bg} ${cfg.color}` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {cfg.label}
                  </button>
                );
              })}
            </div>

            {proposalsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
            ) : proposals.length === 0 ? (
              <div className="card p-10 text-center">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhuma proposta {PROPOSAL_STATUS_CONFIG[proposalFilter]?.label.toLowerCase()}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.map(p => {
                  const cfg = PROPOSAL_STATUS_CONFIG[p.status] || PROPOSAL_STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={p.id} className={clsx('card p-4 border', cfg.bg)}>
                      <div className="flex items-start gap-4">
                        <div className={clsx('flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0', cfg.bg, cfg.color)}>
                          <Icon className="w-3.5 h-3.5" /> {cfg.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <div className="font-bold text-gray-900 text-sm">{p.buyer_name}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {p.property_code} · {p.property_title}
                                {p.block_label && ` · Quadra ${p.block_label}`}
                                {p.lot_label && ` Lote ${p.lot_label}`}
                                {p.unit_number && ` Unidade ${p.unit_number}`}
                              </div>
                              {p.partner_agency && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {p.partner_agency}{p.partner_broker && ` · ${p.partner_broker}`}
                                </div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-black text-lg text-gray-900">{formatCurrency(p.proposed_price)}</div>
                              <div className="text-xs text-gray-400 capitalize">{p.payment_type.replace('_', ' ')}</div>
                            </div>
                          </div>

                          {p.status === 'pending' && (
                            <div className="flex items-center gap-2 mt-3">
                              <div className="text-xs text-gray-400">
                                Expira: {new Date(p.expires_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </div>
                              <div className="ml-auto flex gap-2">
                                <button
                                  onClick={() => handleReject(p.id)}
                                  disabled={reviewingId === p.id}
                                  className="btn-secondary btn-sm text-red-600 hover:bg-red-50"
                                >
                                  <Ban className="w-3.5 h-3.5" /> Rejeitar
                                </button>
                                <button
                                  onClick={() => handleApprove(p.id)}
                                  disabled={reviewingId === p.id}
                                  className="btn-primary btn-sm"
                                >
                                  {reviewingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                  Aprovar
                                </button>
                              </div>
                            </div>
                          )}

                          {p.rejection_reason && (
                            <div className="text-xs text-red-600 mt-2 bg-red-50 rounded px-2 py-1">
                              Motivo: {p.rejection_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Zonas de Preço ──────────────────────────────────────────── */}
      {tab === 'zones' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-gray-900">Zonas de Preço</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Defina faixas de valor por localização (frente de rio, quadra A, andar alto) e aplique em lote
                </p>
              </div>
              <button onClick={() => { setEditingZone(null); setZoneForm({ name:'', description:'', modifier_type:'per_m2', modifier_value:'', color:'#3b82f6' }); setShowZoneForm(true); }} className="btn-primary btn-sm">
                <Plus className="w-3.5 h-3.5" /> Nova zona
              </button>
            </div>

            {/* Form de zona */}
            {showZoneForm && (
              <div className="card p-5 mb-5 border-2 border-brand-200 bg-brand-50/30">
                <form onSubmit={handleSaveZone} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Nome da zona <span className="text-red-500">*</span></label>
                      <input className="input" placeholder="Ex: Frente Lago, Quadra A" value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="label">Cor</label>
                      <input className="input h-10" type="color" value={zoneForm.color} onChange={e => setZoneForm(f => ({ ...f, color: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Tipo de precificação</label>
                      <select className="input" value={zoneForm.modifier_type} onChange={e => setZoneForm(f => ({ ...f, modifier_type: e.target.value }))}>
                        <option value="per_m2">R$ por m²</option>
                        <option value="fixed">Preço fixo por unidade</option>
                        <option value="percent">% sobre preço base</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">
                        Valor {zoneForm.modifier_type === 'per_m2' ? '(R$/m²)' : zoneForm.modifier_type === 'fixed' ? '(R$)' : '(%)'}
                        <span className="text-red-500"> *</span>
                      </label>
                      <input className="input" type="number" step="0.01" placeholder={zoneForm.modifier_type === 'per_m2' ? '950' : zoneForm.modifier_type === 'fixed' ? '350000' : '10'} value={zoneForm.modifier_value} onChange={e => setZoneForm(f => ({ ...f, modifier_value: e.target.value }))} required />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Descrição (para a IA)</label>
                      <input className="input" placeholder="Ex: Lotes com frente para o lago, maior valorização" value={zoneForm.description} onChange={e => setZoneForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowZoneForm(false)} className="btn-secondary btn-sm">
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                    <button type="submit" className="btn-primary btn-sm" disabled={savingZone}>
                      {savingZone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      {editingZone ? 'Salvar' : 'Criar zona'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Lista de zonas */}
            {zones.length === 0 && !showZoneForm ? (
              <div className="card p-10 text-center">
                <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhuma zona de preço configurada</p>
                <p className="text-xs text-gray-300 mt-1">Crie zonas para aplicar preços diferentes por localização no empreendimento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {zones.map(zone => (
                  <div key={zone.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-4 h-full min-h-10 rounded-full flex-shrink-0 mt-0.5" style={{ background: zone.color, width: 4 }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900">{zone.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ background: zone.color }}>
                            {MODIFIER_TYPE_LABELS[zone.modifier_type]}
                          </span>
                          <span className="text-sm font-bold text-gray-700">
                            {zone.modifier_type === 'per_m2' ? `R$ ${Number(zone.modifier_value).toLocaleString('pt-BR')}/m²`
                             : zone.modifier_type === 'fixed'  ? formatCurrency(zone.modifier_value)
                             : `${zone.modifier_value > 0 ? '+' : ''}${zone.modifier_value}%`}
                          </span>
                          <span className="text-xs text-gray-400">{zone.units_count} unidades</span>
                        </div>
                        {zone.description && <p className="text-xs text-gray-500 mt-1">{zone.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleApplyZone(zone.name)}
                          className="btn-secondary btn-sm text-xs"
                          title="Aplicar preços desta zona às unidades"
                        >
                          <TrendingUp className="w-3 h-3" /> Aplicar
                        </button>
                        <button
                          onClick={() => { setEditingZone(zone); setZoneForm({ name: zone.name, description: zone.description || '', modifier_type: zone.modifier_type, modifier_value: String(zone.modifier_value), color: zone.color }); setShowZoneForm(true); }}
                          className="p-1.5 text-gray-300 hover:text-brand-500 rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteZone(zone.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Dica */}
            {zones.length > 0 && (
              <div className="mt-4 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                <strong>Como funciona:</strong> Crie zonas (ex: "Frente Lago", "Quadra A"), associe as unidades a uma zona pelo campo "zona" no CSV ou editando manualmente, e clique em "Aplicar" para atualizar todos os preços da zona de uma vez.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {proposalUnit && wsId && (
        <ProposalModal
          unit={proposalUnit}
          developmentId={developmentId}
          workspaceId={wsId}
          onClose={() => setProposalUnit(null)}
          onSuccess={() => { setProposalUnit(null); loadUnits(); }}
        />
      )}

      {showCsvModal && wsId && (
        <CsvImportModal
          developmentId={developmentId}
          workspaceId={wsId}
          onClose={() => setShowCsvModal(false)}
          onSuccess={() => { setShowCsvModal(false); loadUnits(); }}
        />
      )}

      {showPriceModal && wsId && (
        <PriceAdjustModal
          developmentId={developmentId}
          workspaceId={wsId}
          zones={zones}
          blocks={blocks}
          onClose={() => setShowPriceModal(false)}
          onSuccess={() => { setShowPriceModal(false); loadUnits(); }}
        />
      )}

      {showImportWizard && wsId && (
        <LoteamentoImportWizard
          workspaceId={wsId}
          developmentId={developmentId}
          onClose={() => setShowImportWizard(false)}
          onImported={loadUnits}
        />
      )}

      {editUnit && wsId && (
        <UnitEditModal
          unit={editUnit}
          developmentId={developmentId}
          workspaceId={wsId}
          zones={zones}
          onClose={() => setEditUnit(null)}
          onSaved={updated => {
            setUnits(prev => prev.map(u => u.id === editUnit.id ? { ...u, ...updated } : u));
            setEditUnit(null);
          }}
        />
      )}
    </>
  );
}
