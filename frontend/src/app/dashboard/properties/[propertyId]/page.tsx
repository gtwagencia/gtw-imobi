'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Header from '@/components/layout/Header';
import PropertyForm from '@/components/properties/PropertyForm';
import api from '@/lib/api';
import type { Property, PropertyMedia } from '@/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/propertyConstants';
import {
  ArrowLeft, Trash2, Star, Upload, Building2, Video, GripVertical, Loader2,
} from 'lucide-react';
import clsx from 'clsx';

export default function PropertyDetailPage() {
  const { currentOrg, currentWorkspace } = useAuth();
  const router = useRouter();
  const { propertyId } = useParams<{ propertyId: string }>();

  const [property, setProperty] = useState<Property | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      router.push('/dashboard/properties');
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !currentWorkspace || !property) return;
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
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  async function onDragEnd(result: DropResult) {
    const { destination, source } = result;
    if (!destination || !currentWorkspace || !property) return;
    if (destination.index === source.index) return;

    const newMedia = [...property.media];
    const [moved] = newMedia.splice(source.index, 1);
    newMedia.splice(destination.index, 0, moved);
    setProperty({ ...property, media: newMedia });

    await api.put(`/workspaces/${currentWorkspace.id}/properties/${property.id}/media/reorder`, {
      mediaIds: newMedia.map(m => m.id),
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
            <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/properties')}>
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

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Galeria de mídia */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Fotos e mídia</h3>
              <label className={clsx('btn-secondary text-sm cursor-pointer', uploading && 'opacity-60 pointer-events-none')}>
                <Upload className="w-4 h-4" />
                {uploading ? 'Enviando...' : 'Adicionar mídia'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>

            {property.media.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma foto adicionada ainda</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="property-media" direction="horizontal">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                    >
                      {property.media.map((m, index) => (
                        <Draggable key={m.id} draggableId={m.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={clsx(
                                'relative rounded-xl overflow-hidden border group bg-gray-100 aspect-video',
                                m.is_cover ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200',
                                dragSnapshot.isDragging && 'shadow-lg'
                              )}
                            >
                              {m.media_type === 'video' ? (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                  <Video className="w-8 h-8 text-white opacity-70" />
                                </div>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.url} alt="" className="w-full h-full object-cover" />
                              )}

                              {m.is_cover && (
                                <span className="absolute top-1.5 left-1.5 bg-brand-600 text-white text-xs font-medium px-1.5 py-0.5 rounded-full">
                                  Capa
                                </span>
                              )}

                              <div
                                {...dragProvided.dragHandleProps}
                                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                                title="Arrastar para reordenar"
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>

                              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                {!m.is_cover ? (
                                  <button
                                    onClick={() => handleSetCover(m.id)}
                                    className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                                    title="Tornar capa"
                                  >
                                    <Star className="w-3.5 h-3.5" />
                                  </button>
                                ) : <span />}
                                <button
                                  onClick={() => handleRemoveMedia(m.id)}
                                  className="p-1.5 rounded-full bg-black/40 text-white hover:bg-red-600"
                                  title="Remover"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          {/* Formulário */}
          <PropertyForm
            property={property}
            workspaceId={currentWorkspace.id}
            orgId={currentOrg.id}
            onSave={(saved) => setProperty(prev => prev ? { ...prev, ...saved, media: prev.media } : prev)}
          />
        </div>
      </div>
    </>
  );
}
