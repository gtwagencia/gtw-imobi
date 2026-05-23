'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { connectSocket } from '@/lib/socket';
import Header from '@/components/layout/Header';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import api from '@/lib/api';
import type { Conversation } from '@/types';
import { MessageSquare, Plus, X, Search } from 'lucide-react';
import clsx from 'clsx';
import { useNotifications } from '@/hooks/useNotifications';

// ── Modal nova conversa ───────────────────────────────────────────────────────

interface Inbox   { id: string; name: string; channel_type: string; }
interface Contact { id: string; name: string; phone: string; }

function NewConversationModal({ workspaceId, onClose, onCreated }: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}) {
  const [inboxes,       setInboxes]       = useState<Inbox[]>([]);
  const [contacts,      setContacts]      = useState<Contact[]>([]);
  const [inboxId,       setInboxId]       = useState('');
  const [contactId,     setContactId]     = useState('');
  const [firstMessage,  setFirstMessage]  = useState('');
  const [search,        setSearch]        = useState('');
  const [loading,       setLoading]       = useState(false);
  const [loadingC,      setLoadingC]      = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/inboxes`).then(({ data }) => {
      const whatsapp = data.filter((i: Inbox) =>
        ['whatsapp_evolution', 'whatsapp_official'].includes(i.channel_type)
      );
      setInboxes(whatsapp);
      if (whatsapp.length) setInboxId(whatsapp[0].id);
    }).catch(() => {});
  }, [workspaceId]);

  const searchContacts = useCallback(async (q: string) => {
    setLoadingC(true);
    try {
      const { data } = await api.get(`/workspaces/${workspaceId}/contacts`, {
        params: { limit: 30, search: q || undefined },
      });
      setContacts(data.data.filter((c: Contact) => c.phone));
    } finally { setLoadingC(false); }
  }, [workspaceId]);

  useEffect(() => {
    const t = setTimeout(() => searchContacts(search), 300);
    return () => clearTimeout(t);
  }, [search, searchContacts]);

  async function handleCreate() {
    if (!inboxId)    { setError('Selecione uma inbox'); return; }
    if (!contactId)  { setError('Selecione um contato'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/conversations`, {
        inboxId,
        contactId,
        firstMessage: firstMessage.trim() || undefined,
      });
      onCreated(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao criar conversa');
    } finally { setLoading(false); }
  }

  const selectedContact = contacts.find(c => c.id === contactId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Nova conversa</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Inbox */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Canal *</label>
            <select className="input" value={inboxId} onChange={e => setInboxId(e.target.value)}>
              {inboxes.length === 0 && <option value="">Nenhuma inbox WhatsApp disponível</option>}
              {inboxes.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.channel_type === 'whatsapp_official' ? 'API Oficial' : 'Evolution'})
                </option>
              ))}
            </select>
          </div>

          {/* Busca de contato */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contato *</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={e => { setSearch(e.target.value); setContactId(''); }}
              />
            </div>

            {selectedContact ? (
              <div className="flex items-center justify-between rounded-xl border border-brand-500 bg-brand-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedContact.name}</p>
                  <p className="text-xs text-gray-500">{selectedContact.phone}</p>
                </div>
                <button onClick={() => { setContactId(''); setSearch(''); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100">
                {loadingC ? (
                  <div className="py-4 text-center text-sm text-gray-400">Buscando...</div>
                ) : contacts.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-400">
                    {search ? 'Nenhum resultado' : 'Digite para buscar contatos'}
                  </div>
                ) : contacts.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContactId(c.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primeira mensagem (opcional) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Primeira mensagem <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              value={firstMessage}
              onChange={e => setFirstMessage(e.target.value)}
              placeholder="Olá! Como posso ajudar?"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleCreate} disabled={loading || !inboxId || !contactId} className="btn-primary">
            {loading ? 'Criando...' : 'Iniciar conversa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

function ConversationsInner() {
  const { currentWorkspace, accessToken } = useAuth();
  const searchParams = useSearchParams();
  const [selected,    setSelected]    = useState<Conversation | null>(null);
  const [newConvOpen, setNewConvOpen] = useState(false);

  useNotifications(selected?.id);

  useEffect(() => {
    if (currentWorkspace) connectSocket(currentWorkspace.id, accessToken ?? undefined);
  }, [currentWorkspace, accessToken]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || !currentWorkspace) return;
    api.get(`/workspaces/${currentWorkspace.id}/conversations/${id}`)
      .then(({ data }) => setSelected(data))
      .catch(() => {});
  }, [searchParams, currentWorkspace]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Conversas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace para ver as conversas
        </div>
      </>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className={clsx(
        'md:w-80 md:flex-shrink-0 md:flex',
        selected ? 'hidden' : 'flex w-full'
      )}>
        <ConversationList
          workspaceId={currentWorkspace.id}
          selected={selected?.id ?? null}
          onSelect={setSelected}
          onNewConversation={() => setNewConvOpen(true)}
        />
      </div>

      {selected ? (
        <ChatWindow
          conversation={selected}
          onStatusChange={(updated) => setSelected(updated)}
          onBack={() => setSelected(null)}
        />
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-gray-50">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="font-medium text-gray-900 mb-1">Nenhuma conversa selecionada</h3>
          <p className="text-gray-400 text-sm">Escolha uma conversa na lista para começar</p>
          <button className="btn-primary mt-4 text-sm" onClick={() => setNewConvOpen(true)}>
            <Plus className="w-4 h-4" /> Nova conversa
          </button>
        </div>
      )}

      {newConvOpen && (
        <NewConversationModal
          workspaceId={currentWorkspace.id}
          onClose={() => setNewConvOpen(false)}
          onCreated={(conv) => {
            setSelected(conv);
            setNewConvOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConversationsInner />
    </Suspense>
  );
}
