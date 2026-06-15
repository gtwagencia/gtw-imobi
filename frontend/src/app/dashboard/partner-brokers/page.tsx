'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { PartnerBroker } from '@/types';
import { Plus, Pencil, Trash2, Check, Handshake } from 'lucide-react';

export default function PartnerBrokersPage() {
  const { currentWorkspace } = useAuth();
  const [items,   setItems]   = useState<PartnerBroker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<PartnerBroker> | null>(null);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/partner-brokers`);
    setItems(data);
    setLoading(false);
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!currentWorkspace || !editing?.name?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name:       editing.name?.trim(),
        agencyName: editing.agency_name?.trim() || null,
        creci:      editing.creci?.trim() || null,
        phone:      editing.phone?.trim() || null,
        email:      editing.email?.trim() || null,
        pixKey:     editing.pix_key?.trim() || null,
        notes:      editing.notes?.trim() || null,
      };
      if (editing.id) {
        await api.put(`/workspaces/${currentWorkspace.id}/partner-brokers/${editing.id}`, payload);
      } else {
        await api.post(`/workspaces/${currentWorkspace.id}/partner-brokers`, payload);
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!currentWorkspace || !confirm('Remover este corretor parceiro?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/partner-brokers/${id}`);
    load();
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Corretores parceiros" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Corretores parceiros"
        actions={
          <button
            className="btn-primary text-sm"
            onClick={() => setEditing({ name: '' })}
          >
            <Plus className="w-4 h-4" />
            Novo corretor parceiro
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-2xl">
        <p className="text-sm text-gray-500 mb-4">
          Corretores e imobiliárias externas que trazem compradores e recebem parte da comissão (split de corretagem)
          ao registrar uma venda.
        </p>

        {/* Form */}
        {editing && (
          <div className="card p-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              {editing.id ? 'Editar corretor parceiro' : 'Novo corretor parceiro'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  className="input"
                  placeholder="Nome do corretor"
                  value={editing.name || ''}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imobiliária/Agência</label>
                <input
                  className="input"
                  value={editing.agency_name || ''}
                  onChange={e => setEditing(p => ({ ...p, agency_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CRECI</label>
                <input
                  className="input"
                  value={editing.creci || ''}
                  onChange={e => setEditing(p => ({ ...p, creci: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input
                  className="input"
                  value={editing.phone || ''}
                  onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  className="input"
                  type="email"
                  value={editing.email || ''}
                  onChange={e => setEditing(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Chave PIX (para repasse de comissão)</label>
                <input
                  className="input"
                  value={editing.pix_key || ''}
                  onChange={e => setEditing(p => ({ ...p, pix_key: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={editing.notes || ''}
                  onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !editing.name?.trim()}
              >
                <Check className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4 h-14 animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Handshake className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="mb-1">Nenhum corretor parceiro cadastrado</p>
            <p className="text-sm">Cadastre corretores externos para dividir a comissão de vendas automaticamente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="card p-4 flex items-center gap-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.name}
                    {item.agency_name && <span className="text-gray-400 font-normal"> · {item.agency_name}</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {[item.creci && `CRECI ${item.creci}`, item.phone, item.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => setEditing(item)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
