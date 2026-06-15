'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import DevelopmentForm from '@/components/properties/DevelopmentForm';
import MediaGallery, { GalleryMediaItem } from '@/components/properties/MediaGallery';
import LoteamentoImportWizard from '@/components/properties/LoteamentoImportWizard';
import api from '@/lib/api';
import type { Development, DevelopmentMedia } from '@/types';
import {
  CONSTRUCTION_STATUS_COLORS, CONSTRUCTION_STATUS_LABELS, PROPERTY_TYPE_LABELS,
  STATUS_COLORS, STATUS_LABELS, propertyPriceLabel,
} from '@/lib/propertyConstants';
import { ArrowLeft, Trash2, Loader2, Building2, FileUp, Map, HardHat } from 'lucide-react';
import clsx from 'clsx';

export default function DevelopmentDetailPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();
  const { developmentId } = useParams<{ developmentId: string }>();

  const [development, setDevelopment] = useState<Development | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);

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

  async function handleDelete() {
    if (!currentWorkspace || !development) return;
    if (!confirm(`Excluir o empreendimento "${development.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/developments/${development.id}`);
      router.push('/dashboard/developments');
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpload(files: FileList) {
    if (!currentWorkspace || !development) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await api.post<DevelopmentMedia>(
          `/workspaces/${currentWorkspace.id}/developments/${development.id}/media`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setDevelopment(prev => prev ? { ...prev, media: [...prev.media, data] } : prev);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveMedia(mediaId: string) {
    if (!currentWorkspace || !development) return;
    if (!confirm('Remover esta mídia?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/developments/${development.id}/media/${mediaId}`);
    load();
  }

  async function handleSetCover(mediaId: string) {
    if (!currentWorkspace || !development) return;
    await api.put(`/workspaces/${currentWorkspace.id}/developments/${development.id}/media/${mediaId}/cover`, {});
    setDevelopment(prev => prev ? {
      ...prev,
      media: prev.media.map(m => ({ ...m, is_cover: m.id === mediaId })),
    } : prev);
  }

  async function handleToggleShowOnSite(mediaId: string, showOnSite: boolean) {
    if (!currentWorkspace || !development) return;
    await api.put(`/workspaces/${currentWorkspace.id}/developments/${development.id}/media/${mediaId}/show-on-site`, { showOnSite });
    setDevelopment(prev => prev ? {
      ...prev,
      media: prev.media.map(m => m.id === mediaId ? { ...m, show_on_site: showOnSite } : m),
    } : prev);
  }

  async function handleReorder(orderedMedia: GalleryMediaItem[]) {
    if (!currentWorkspace || !development) return;
    setDevelopment({ ...development, media: orderedMedia as DevelopmentMedia[] });

    await api.put(`/workspaces/${currentWorkspace.id}/developments/${development.id}/media/reorder`, {
      mediaIds: orderedMedia.map(m => m.id),
    }).catch(() => load());
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Empreendimento" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Empreendimento" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </>
    );
  }

  if (!development) {
    return (
      <>
        <Header title="Empreendimento" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Empreendimento não encontrado
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`${development.code} · ${development.name}`}
        actions={
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs font-medium px-2 py-1 rounded-full', CONSTRUCTION_STATUS_COLORS[development.construction_status])}>
              {CONSTRUCTION_STATUS_LABELS[development.construction_status]}
            </span>
            <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/developments')}>
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            <button className="btn-secondary text-sm text-red-600 hover:bg-red-50" disabled={deleting} onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Galeria de mídia */}
          <MediaGallery
            media={development.media}
            uploading={uploading}
            onUpload={handleUpload}
            onRemove={handleRemoveMedia}
            onSetCover={handleSetCover}
            onToggleShowOnSite={handleToggleShowOnSite}
            onReorder={handleReorder}
          />

          {/* Unidades vinculadas */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Unidades ({development.units.length})</h3>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary text-sm"
                  onClick={() => router.push(`/dashboard/developments/${development.id}/sales-map`)}
                >
                  <Map className="w-4 h-4" />
                  Mapa de vendas
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => router.push(`/dashboard/developments/${development.id}/construction`)}
                >
                  <HardHat className="w-4 h-4" />
                  Cronograma de obra
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => setShowImportWizard(true)}
                >
                  <FileUp className="w-4 h-4" />
                  Importar loteamento (PDF)
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => router.push(`/dashboard/properties/new?developmentId=${development.id}`)}
                >
                  Cadastrar unidade
                </button>
              </div>
            </div>
            {development.units.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma unidade vinculada a este empreendimento ainda</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {development.units.map(u => (
                  <button
                    key={u.id}
                    onClick={() => router.push(`/dashboard/properties/${u.id}`)}
                    className="card overflow-hidden text-left hover:shadow-md transition-shadow"
                  >
                    <div className="relative h-24 bg-gray-100 flex items-center justify-center overflow-hidden">
                      {u.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.cover_url} alt={u.title} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-6 h-6 text-gray-300" />
                      )}
                      <span className={clsx('absolute top-1.5 left-1.5 text-xs font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[u.status])}>
                        {STATUS_LABELS[u.status]}
                      </span>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-mono text-gray-400">{u.code}</span>
                        <span className="text-xs text-gray-400">{PROPERTY_TYPE_LABELS[u.property_type]}</span>
                      </div>
                      <h4 className="text-sm font-medium text-gray-900 truncate mb-1">{u.title}</h4>
                      <p className="text-sm font-semibold text-brand-700">{propertyPriceLabel(u)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Formulário */}
          <DevelopmentForm
            development={development}
            workspaceId={currentWorkspace.id}
            onSave={(saved) => setDevelopment(prev => prev ? { ...prev, ...saved, media: prev.media, units: prev.units } : prev)}
          />
        </div>
      </div>

      {showImportWizard && (
        <LoteamentoImportWizard
          workspaceId={currentWorkspace.id}
          developmentId={development.id}
          onClose={() => setShowImportWizard(false)}
          onImported={load}
        />
      )}
    </>
  );
}
