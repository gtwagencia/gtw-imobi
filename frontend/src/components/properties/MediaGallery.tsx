'use client';

import { useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  Trash2, Star, Upload, Building2, Video, GripVertical, Loader2, Eye, EyeOff,
} from 'lucide-react';
import clsx from 'clsx';

export interface GalleryMediaItem {
  id: string;
  url: string;
  media_type: string;
  position: number;
  is_cover: boolean;
  show_on_site: boolean;
}

interface MediaGalleryProps {
  media: GalleryMediaItem[];
  uploading: boolean;
  onUpload: (files: FileList) => void;
  onRemove: (mediaId: string) => void;
  onSetCover: (mediaId: string) => void;
  onToggleShowOnSite: (mediaId: string, showOnSite: boolean) => void;
  onReorder: (orderedMedia: GalleryMediaItem[]) => void;
  readOnly?: boolean;
}

export default function MediaGallery({
  media, uploading, onUpload, onRemove, onSetCover, onToggleShowOnSite, onReorder, readOnly = false,
}: MediaGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files?.length) onUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleToggleShowOnSite(item: GalleryMediaItem) {
    setPendingToggle(item.id);
    try {
      await onToggleShowOnSite(item.id, !item.show_on_site);
    } finally {
      setPendingToggle(null);
    }
  }

  function onDragEnd(result: DropResult) {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;

    const newMedia = [...media];
    const [moved] = newMedia.splice(source.index, 1);
    newMedia.splice(destination.index, 0, moved);
    onReorder(newMedia);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Fotos e mídia</h3>
          <p className="text-xs text-gray-400 mt-0.5">Arraste para reordenar · escolha a foto de capa · controle o que aparece no site</p>
        </div>
        {!readOnly && (
          <label className={clsx('btn-secondary text-sm cursor-pointer', uploading && 'opacity-60 pointer-events-none')}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Enviando...' : 'Adicionar mídia'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {media.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma foto adicionada ainda</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="media-gallery" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
              >
                {media.map((m, index) => (
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
                          <img src={m.url} alt="" className={clsx('w-full h-full object-cover', !m.show_on_site && 'opacity-50')} />
                        )}

                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                          {m.is_cover && (
                            <span className="bg-brand-600 text-white text-xs font-medium px-1.5 py-0.5 rounded-full">
                              Capa
                            </span>
                          )}
                          {!m.show_on_site && (
                            <span className="bg-gray-800/80 text-white text-xs font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1">
                              <EyeOff className="w-3 h-3" />
                              Oculta no site
                            </span>
                          )}
                        </div>

                        {!readOnly && (
                          <div
                            {...dragProvided.dragHandleProps}
                            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                            title="Arrastar para reordenar"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        )}

                        {!readOnly && (
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1">
                              {!m.is_cover && (
                                <button
                                  type="button"
                                  onClick={() => onSetCover(m.id)}
                                  className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"
                                  title="Tornar capa"
                                >
                                  <Star className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleShowOnSite(m)}
                                disabled={pendingToggle === m.id}
                                className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-50"
                                title={m.show_on_site ? 'Ocultar do site' : 'Mostrar no site'}
                              >
                                {pendingToggle === m.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : m.show_on_site ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemove(m.id)}
                              className="p-1.5 rounded-full bg-black/40 text-white hover:bg-red-600"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
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
  );
}
