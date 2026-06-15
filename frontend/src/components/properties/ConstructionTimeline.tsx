'use client';

import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult, DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import api from '@/lib/api';
import type { ConstructionStage } from '@/types';
import { CONSTRUCTION_STAGE_STATUS_LABELS, CONSTRUCTION_STAGE_STATUS_COLORS } from '@/lib/propertyConstants';
import { Plus, Trash2, Loader2, GripVertical, Upload, HardHat } from 'lucide-react';
import clsx from 'clsx';

interface ConstructionTimelineProps {
  workspaceId: string;
  developmentId: string;
}

const STATUS_OPTIONS: ConstructionStage['status'][] = ['pendente', 'em_andamento', 'concluida'];

export default function ConstructionTimeline({ workspaceId, developmentId }: ConstructionTimelineProps) {
  const [stages,  setStages]  = useState<ConstructionStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const base = `/workspaces/${workspaceId}/developments/${developmentId}/construction-stages`;

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<ConstructionStage[]>(base);
      setStages(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, developmentId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<ConstructionStage>(base, { name: newName.trim() });
      setStages(prev => [...prev, data]);
      setNewName('');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(stageId: string, body: Record<string, unknown>) {
    const { data } = await api.put<ConstructionStage>(`${base}/${stageId}`, body);
    setStages(prev => prev.map(s => s.id === stageId ? { ...data, photos: s.photos } : s));
  }

  async function handleDelete(stageId: string) {
    if (!confirm('Excluir esta etapa? As fotos vinculadas também serão removidas.')) return;
    await api.delete(`${base}/${stageId}`);
    setStages(prev => prev.filter(s => s.id !== stageId));
  }

  async function handleUploadPhoto(stageId: string, files: FileList) {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`${base}/${stageId}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStages(prev => prev.map(s => s.id === stageId ? { ...s, photos: [...s.photos, data] } : s));
    }
  }

  async function handleRemovePhoto(stageId: string, photoId: string) {
    if (!confirm('Remover esta foto?')) return;
    await api.delete(`${base}/${stageId}/photos/${photoId}`);
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, photos: s.photos.filter(p => p.id !== photoId) } : s));
  }

  async function onDragEnd(result: DropResult) {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    setStages(reordered);

    await api.put(`${base}/reorder`, { stageIds: reordered.map(s => s.id) }).catch(() => load());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-2">
        <input
          className="input text-sm flex-1"
          placeholder="Nome da nova etapa (ex.: Fundação, Estrutura, Acabamento...)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button className="btn-primary text-sm" disabled={creating || !newName.trim()} onClick={handleCreate}>
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Adicionar etapa
        </button>
      </div>

      {stages.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <HardHat className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma etapa cadastrada ainda</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="construction-stages">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                {stages.map((stage, index) => (
                  <Draggable key={stage.id} draggableId={stage.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={clsx('card p-4', dragSnapshot.isDragging && 'shadow-lg')}
                      >
                        <StageCard
                          stage={stage}
                          dragHandleProps={dragProvided.dragHandleProps}
                          onUpdate={(body) => handleUpdate(stage.id, body)}
                          onDelete={() => handleDelete(stage.id)}
                          onUploadPhoto={(files) => handleUploadPhoto(stage.id, files)}
                          onRemovePhoto={(photoId) => handleRemovePhoto(stage.id, photoId)}
                        />
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

interface StageCardProps {
  stage: ConstructionStage;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onUpdate: (body: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
  onUploadPhoto: (files: FileList) => Promise<void>;
  onRemovePhoto: (photoId: string) => void;
}

function StageCard({ stage, dragHandleProps, onUpdate, onDelete, onUploadPhoto, onRemovePhoto }: StageCardProps) {
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description || '');
  const [uploading, setUploading] = useState(false);

  function handleNameBlur() {
    if (name.trim() && name !== stage.name) onUpdate({ name: name.trim() });
  }

  function handleDescriptionBlur() {
    if (description !== (stage.description || '')) onUpdate({ description: description || null });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      await onUploadPhoto(files);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div {...dragHandleProps} className="mt-2 text-gray-300 hover:text-gray-400 cursor-grab" title="Arrastar para reordenar">
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="input text-sm font-medium flex-1 min-w-[180px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
            />
            <select
              className={clsx('input text-sm w-auto border-0 font-medium', CONSTRUCTION_STAGE_STATUS_COLORS[stage.status])}
              value={stage.status}
              onChange={(e) => onUpdate({ status: e.target.value })}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{CONSTRUCTION_STAGE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <textarea
            className="input text-sm w-full"
            rows={2}
            placeholder="Descrição da etapa..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
          />

          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
            <label className="flex items-center gap-1">
              Previsto:
              <input
                type="date"
                className="input text-xs py-1"
                value={stage.planned_date ? stage.planned_date.slice(0, 10) : ''}
                onChange={(e) => onUpdate({ plannedDate: e.target.value || null })}
              />
            </label>
            <label className="flex items-center gap-1">
              Concluído:
              <input
                type="date"
                className="input text-xs py-1"
                value={stage.completed_date ? stage.completed_date.slice(0, 10) : ''}
                onChange={(e) => onUpdate({ completedDate: e.target.value || null })}
              />
            </label>
          </div>
        </div>

        <button className="btn-ghost text-sm text-red-500 hover:bg-red-50 p-1.5" onClick={onDelete} title="Excluir etapa">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Fotos da etapa */}
      <div className="flex flex-wrap gap-2 pl-6">
        {stage.photos.map(photo => (
          <div key={photo.id} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onRemovePhoto(photo.id)}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
              title="Remover foto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        <label className={clsx(
          'w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 cursor-pointer hover:border-brand-300 hover:text-brand-500 transition-colors',
          uploading && 'opacity-60 pointer-events-none'
        )}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
      </div>
    </div>
  );
}
