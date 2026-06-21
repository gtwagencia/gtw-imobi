'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import PropertyForm from '@/components/properties/PropertyForm';
import MediaGallery, { GalleryMediaItem } from '@/components/properties/MediaGallery';
import DocumentVault from '@/components/properties/DocumentVault';
import CmaPanel from '@/components/properties/CmaPanel';
import SignQrCode from '@/components/properties/SignQrCode';
import SaleConditionsPanel from '@/components/properties/SaleConditionsPanel';
import ProposalsPanel from '@/components/properties/ProposalsPanel';
import api from '@/lib/api';
import type { Property, PropertyMedia } from '@/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/propertyConstants';
import { ArrowLeft, Trash2, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export default function PropertyDetailPage() {
  const { currentOrg, currentWorkspace } = useAuth();
  // Apenas admin e auxiliar_administrativo podem editar/excluir imóveis
  const canEdit = !currentWorkspace?.role
    || currentWorkspace.role === 'admin'
    || currentWorkspace.role === 'auxiliar_administrativo';
  const router = useRouter();
  const { propertyId } = useParams<{ propertyId: string }>();

  const [property, setProperty] = useState<Property | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/properties/${propertyId}`);
      setProperty(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, propertyId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!currentWorkspace || !property) return;
    if (!confirm(`Excluir o imóvel "${property.title}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/properties/${property.id}`);
      router.push('/dashboard/imoveis');
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpload(files: FileList) {
    if (!currentWorkspace || !property) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await api.post<PropertyMedia>(
          `/workspaces/${currentWorkspace.id}/properties/${property.id}/media`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        setProperty(prev => prev ? { ...prev, media: [...prev.media, data] } : prev);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveMedia(mediaId: string) {
    if (!currentWorkspace || !property) return;
    if (!confirm('Remover esta mídia?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/properties/${property.id}/media/${mediaId}`);
    load();
  }

  async function handleSetCover(mediaId: string) {
    if (!currentWorkspace || !property) return;
    await api.put(`/workspaces/${currentWorkspace.id}/properties/${property.id}/media/${mediaId}/cover`, {});
    setProperty(prev => prev ? {
      ...prev,
      media: prev.media.map(m => ({ ...m, is_cover: m.id === mediaId })),
    } : prev);
  }

  async function handleToggleShowOnSite(mediaId: string, showOnSite: boolean) {
    if (!currentWorkspace || !property) return;
    await api.put(`/workspaces/${currentWorkspace.id}/properties/${property.id}/media/${mediaId}/show-on-site`, { showOnSite });
    setProperty(prev => prev ? {
      ...prev,
      media: prev.media.map(m => m.id === mediaId ? { ...m, show_on_site: showOnSite } : m),
    } : prev);
  }

  async function handleReorder(orderedMedia: GalleryMediaItem[]) {
    if (!currentWorkspace || !property) return;
    setProperty({ ...property, media: orderedMedia as PropertyMedia[] });

    await api.put(`/workspaces/${currentWorkspace.id}/properties/${property.id}/media/reorder`, {
      mediaIds: orderedMedia.map(m => m.id),
    }).catch(() => load());
  }

  if (!currentOrg || !currentWorkspace) {
    return (
      <>
        <Header title="Imóvel" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Imóvel" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </>
    );
  }

  if (!property) {
    return (
      <>
        <Header title="Imóvel" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Imóvel não encontrado
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`${property.code} · ${property.title}`}
        actions={
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs font-medium px-2 py-1 rounded-full', STATUS_COLORS[property.status])}>
              {STATUS_LABELS[property.status]}
            </span>
            <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/imoveis')}>
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            {canEdit && (
              <button className="btn-secondary text-sm text-red-600 hover:bg-red-50" disabled={deleting} onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-7xl mx-auto">

          {/* Galeria — full width hero */}
          <div className="mb-5">
            <MediaGallery
              media={property.media}
              uploading={uploading}
              onUpload={handleUpload}
              onRemove={handleRemoveMedia}
              onSetCover={handleSetCover}
              onToggleShowOnSite={handleToggleShowOnSite}
              onReorder={handleReorder}
              readOnly={!canEdit}
            />
          </div>

          {/* Duas colunas: formulário à esquerda, painéis auxiliares à direita */}
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            <div className="flex-1 min-w-0">
              <PropertyForm
                property={property}
                workspaceId={currentWorkspace.id}
                orgId={currentOrg.id}
                onSave={(saved) => setProperty(prev => prev ? { ...prev, ...saved, media: prev.media } : prev)}
                readOnly={!canEdit}
              />
            </div>

            <div className="lg:w-80 xl:w-96 flex-shrink-0 space-y-4">
              <CmaPanel
                workspaceId={currentWorkspace.id}
                property={property}
                onUpdate={(updated) => setProperty(prev => prev ? { ...prev, ...updated, media: prev.media } : prev)}
              />
              <DocumentVault workspaceId={currentWorkspace.id} propertyId={property.id} />
              <SignQrCode workspaceId={currentWorkspace.id} propertyId={property.id} />
              {property.development_id && (
                <SaleConditionsPanel workspaceId={currentWorkspace.id} propertyId={property.id} purpose={property.purpose} />
              )}
              <ProposalsPanel workspaceId={currentWorkspace.id} propertyId={property.id} />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
