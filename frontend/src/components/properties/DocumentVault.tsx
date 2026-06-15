'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import type { PropertyDocument, PropertyDocumentCategory } from '@/types';
import { DOCUMENT_CATEGORY_LABELS } from '@/lib/propertyConstants';
import { FileText, Upload, Trash2, Download, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

interface DocumentVaultProps {
  workspaceId: string;
  propertyId: string;
}

function expiryInfo(expiresAt: string | null): { label: string; className: string } | null {
  if (!expiresAt) return null;

  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const formatted = new Date(expiresAt).toLocaleDateString('pt-BR');

  if (days < 0) return { label: `Venceu em ${formatted}`, className: 'bg-red-100 text-red-700' };
  if (days <= 30) return { label: `Vence em ${formatted}`, className: 'bg-yellow-100 text-yellow-700' };
  return { label: `Válido até ${formatted}`, className: 'bg-gray-100 text-gray-500' };
}

export default function DocumentVault({ workspaceId, propertyId }: DocumentVaultProps) {
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);

  const [name,      setName]      = useState('');
  const [category,  setCategory]  = useState<PropertyDocumentCategory>('outro');
  const [expiresAt, setExpiresAt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<PropertyDocument[]>(`/workspaces/${workspaceId}/properties/${propertyId}/documents`);
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name || file.name);
      formData.append('category', category);
      if (expiresAt) formData.append('expiresAt', expiresAt);

      const { data } = await api.post<PropertyDocument>(
        `/workspaces/${workspaceId}/properties/${propertyId}/documents`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setDocuments(prev => [data, ...prev]);
      setName('');
      setCategory('outro');
      setExpiresAt('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemove(doc: PropertyDocument) {
    if (!confirm(`Remover o documento "${doc.name}"?`)) return;
    await api.delete(`/workspaces/${workspaceId}/properties/${propertyId}/documents/${doc.id}`);
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
  }

  async function handleToggleClientVisible(doc: PropertyDocument) {
    const isClientVisible = !doc.is_client_visible;
    await api.put(`/workspaces/${workspaceId}/properties/${propertyId}/documents/${doc.id}/visibility`, { isClientVisible });
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, is_client_visible: isClientVisible } : d));
  }

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900">Cofre de documentos</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Matrícula, IPTU, escritura, contratos e outros — com controle de validade.
          Use o ícone de olho para liberar/ocultar o documento no portal do cliente.
        </p>
      </div>

      {/* Formulário de envio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <input
          className="input text-sm"
          placeholder="Nome do documento (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className="input text-sm" value={category} onChange={(e) => setCategory(e.target.value as PropertyDocumentCategory)}>
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          className="input text-sm"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          title="Data de validade (opcional)"
        />
      </div>

      <label className={clsx('btn-secondary text-sm cursor-pointer w-fit mb-4', uploading && 'opacity-60 pointer-events-none')}>
        <Upload className="w-4 h-4" />
        {uploading ? 'Enviando...' : 'Enviar documento'}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Nenhum documento cadastrado
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const expiry = expiryInfo(doc.expires_at);
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">{DOCUMENT_CATEGORY_LABELS[doc.category]}</p>
                </div>
                {expiry && (
                  <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', expiry.className)}>
                    {expiry.className.includes('red') && <AlertTriangle className="w-3 h-3" />}
                    {expiry.label}
                  </span>
                )}
                <button
                  className="btn-ghost px-2 flex-shrink-0"
                  onClick={() => handleToggleClientVisible(doc)}
                  title={doc.is_client_visible ? 'Visível no portal do cliente' : 'Oculto no portal do cliente'}
                >
                  {doc.is_client_visible ? <Eye className="w-4 h-4 text-brand-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                </button>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost px-2 flex-shrink-0"
                  title="Abrir/baixar"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button className="btn-ghost px-2 text-red-500 hover:bg-red-50 flex-shrink-0" onClick={() => handleRemove(doc)} title="Remover">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
