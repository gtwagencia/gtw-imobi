'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Deal } from '@/types';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  MessageSquare, Phone, ChevronRight, Building2, Clock, AlertCircle,
  User, ListChecks, X, Trash2, Send, Home, Plus, Mail, PhoneCall, History,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ─────────────────────────────────────────────────────────────────

interface KanbanStage {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface BrokerNote {
  id: string;
  broker_id: string;
  broker_name?: string;
  content: string;
  created_at: string;
}

interface OfferedItem {
  id: string;
  property_id?: string;
  development_id?: string;
  property_code?: string;
  property_title?: string;
  development_name?: string;
  offerer_name?: string;
  notes?: string;
  offered_at: string;
}

interface ContactDetail {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  lead_status?: 'em_prospeccao' | 'em_atendimento' | 'cliente_ativo';
  client_type?: 'aluguel' | 'venda';
  client_development_id?: string;
  ai_profile?: {
    resumo?: string;
    perfil?: string;
    cidade?: string;
    tipo_imovel?: string;
    [key: string]: unknown;
  };
}

interface Development {
  id: string;
  name: string;
}

interface ContactAttempt {
  id: string;
  channel: 'call' | 'whatsapp' | 'email';
  broker_name: string;
  created_at: string;
}

interface PropertyResult {
  id: string;
  code?: string;
  title?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatResponseTime(s: number | null) {
  if (s === null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function rtColor(s: number | null) {
  if (s === null) return 'text-gray-400';
  if (s < 300) return 'text-green-600';
  if (s < 1800) return 'text-yellow-600';
  return 'text-red-600';
}

function derivedStages(deals: Deal[]): KanbanStage[] {
  const map = new Map<string, KanbanStage>();
  for (const d of deals) {
    if (!map.has(d.stage_id)) {
      map.set(d.stage_id, { id: d.stage_id, name: d.stage_name, color: d.stage_color, position: d.stage_position });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.position - b.position);
}

// ─── DealCard ──────────────────────────────────────────────────────────────

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const hasUnread = (deal.unread_count ?? 0) > 0;
  const waitingTime = deal.last_inbound_at
    ? formatDistanceToNow(new Date(deal.last_inbound_at), { locale: ptBR, addSuffix: false })
    : null;
  const isWaiting = hasUnread && waitingTime && !deal.conv_status?.includes('resolved');

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-pointer',
        'hover:shadow-md hover:border-gray-300 transition-all select-none',
        hasUnread && 'border-l-4 border-l-brand-500',
      )}
    >
      <div className="font-medium text-gray-900 text-sm truncate mb-1">{deal.title}</div>
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
        <User className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{deal.contact_name}</span>
      </div>

      {deal.value > 0 && (
        <div className="text-xs font-semibold text-green-700 mb-1">{currencyFmt.format(deal.value)}</div>
      )}

      {deal.response_time_seconds != null && (
        <div className={clsx('flex items-center gap-1 text-xs mb-1', rtColor(deal.response_time_seconds))}>
          <Clock className="w-3 h-3" />
          {formatResponseTime(deal.response_time_seconds)}
        </div>
      )}

      {isWaiting && (
        <div className="flex items-center gap-1 text-xs text-orange-600">
          <AlertCircle className="w-3 h-3" />
          Aguardando há {waitingTime}
          {hasUnread && (
            <span className="ml-1 flex items-center gap-0.5 text-brand-600">
              <MessageSquare className="w-3 h-3" /> {deal.unread_count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Lead Modal ─────────────────────────────────────────────────────────────

type ModalTab = 'overview' | 'notes' | 'offered' | 'lead-profile' | 'contact-history';

function LeadModal({
  deal,
  isAdmin,
  workspaceId,
  restrictConversations,
  onClose,
}: {
  deal: Deal;
  isAdmin: boolean;
  workspaceId: string;
  restrictConversations: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ModalTab>('overview');

  // Contact
  const [contact, setContact] = useState<ContactDetail | null>(null);

  // Notes
  const [notes, setNotes] = useState<BrokerNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Offered items
  const [offered, setOffered] = useState<OfferedItem[]>([]);
  const [loadingOffered, setLoadingOffered] = useState(false);
  const [showAddOffered, setShowAddOffered] = useState(false);
  const [offeredType, setOfferedType] = useState<'property' | 'development'>('development');
  const [propSearch, setPropSearch] = useState('');
  const [propResults, setPropResults] = useState<PropertyResult[]>([]);
  const [selectedPropId, setSelectedPropId] = useState('');
  const [selectedDevId, setSelectedDevId] = useState('');
  const [offeredNotes, setOfferedNotes] = useState('');
  const [savingOffered, setSavingOffered] = useState(false);

  // Developments list (for admin dropdown + offered form)
  const [developments, setDevelopments] = useState<Development[]>([]);

  // Lead profile (admin only)
  const [profileForm, setProfileForm] = useState({ lead_status: '', client_type: '', client_development_id: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Contact attempts history
  const [attempts, setAttempts] = useState<ContactAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  // Load contact on open
  useEffect(() => {
    api.get<ContactDetail>(`/workspaces/${workspaceId}/contacts/${deal.contact_id}`)
      .then(r => {
        setContact(r.data);
        setProfileForm({
          lead_status: r.data.lead_status || '',
          client_type: r.data.client_type || '',
          client_development_id: r.data.client_development_id || '',
        });
      })
      .catch(() => {});
  }, [deal.contact_id, workspaceId]);

  // Load developments
  useEffect(() => {
    api.get<{ data: Development[] }>(`/workspaces/${workspaceId}/developments?limit=200`)
      .then(r => setDevelopments(r.data?.data || []))
      .catch(() => {});
  }, [workspaceId]);

  const loadNotes = useCallback(() => {
    setLoadingNotes(true);
    api.get<BrokerNote[]>(`/workspaces/${workspaceId}/kanban/deals/${deal.id}/broker-notes`)
      .then(r => setNotes(r.data))
      .catch(() => {})
      .finally(() => setLoadingNotes(false));
  }, [deal.id, workspaceId]);

  const loadOffered = useCallback(() => {
    setLoadingOffered(true);
    api.get<OfferedItem[]>(`/workspaces/${workspaceId}/kanban/deals/${deal.id}/offered-items`)
      .then(r => setOffered(r.data))
      .catch(() => {})
      .finally(() => setLoadingOffered(false));
  }, [deal.id, workspaceId]);

  const loadAttempts = useCallback(() => {
    setLoadingAttempts(true);
    api.get<ContactAttempt[]>(`/workspaces/${workspaceId}/contacts/${deal.contact_id}/attempts`)
      .then(r => setAttempts(r.data))
      .catch(() => {})
      .finally(() => setLoadingAttempts(false));
  }, [deal.contact_id, workspaceId]);

  useEffect(() => { loadNotes(); loadOffered(); loadAttempts(); }, [loadNotes, loadOffered, loadAttempts]);

  // Property search (debounced)
  useEffect(() => {
    if (offeredType !== 'property' || propSearch.trim().length < 2) { setPropResults([]); return; }
    const timer = setTimeout(() => {
      api.get<{ data: PropertyResult[] }>(`/workspaces/${workspaceId}/properties?search=${encodeURIComponent(propSearch)}&limit=20`)
        .then(r => setPropResults(r.data?.data || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [propSearch, offeredType, workspaceId]);

  async function handleAddNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/workspaces/${workspaceId}/kanban/deals/${deal.id}/broker-notes`, { content: newNote.trim() });
      setNewNote('');
      loadNotes();
    } finally { setSavingNote(false); }
  }

  async function handleDeleteNote(id: string) {
    await api.delete(`/workspaces/${workspaceId}/kanban/deals/${deal.id}/broker-notes/${id}`);
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  async function handleAddOffered() {
    if (offeredType === 'property' && !selectedPropId) return;
    if (offeredType === 'development' && !selectedDevId) return;
    setSavingOffered(true);
    try {
      await api.post(`/workspaces/${workspaceId}/kanban/deals/${deal.id}/offered-items`, {
        propertyId: offeredType === 'property' ? selectedPropId : undefined,
        developmentId: offeredType === 'development' ? selectedDevId : undefined,
        notes: offeredNotes.trim() || undefined,
      });
      setShowAddOffered(false);
      setSelectedPropId(''); setSelectedDevId(''); setOfferedNotes(''); setPropSearch('');
      loadOffered();
    } finally { setSavingOffered(false); }
  }

  async function handleDeleteOffered(id: string) {
    await api.delete(`/workspaces/${workspaceId}/kanban/deals/${deal.id}/offered-items/${id}`);
    setOffered(prev => prev.filter(i => i.id !== id));
  }

  async function handleContactAttempt(channel: 'call' | 'whatsapp' | 'email') {
    // Registra a tentativa no backend (não bloqueia a ação)
    api.post(`/workspaces/${workspaceId}/contacts/${deal.contact_id}/attempts`, {
      channel, dealId: deal.id,
    }).then(() => loadAttempts()).catch(() => {});

    // Abre o canal de contato nativo
    const digits = deal.contact_phone?.replace(/\D/g, '') || contact?.phone?.replace(/\D/g, '') || '';
    const phone  = deal.contact_phone || contact?.phone || '';
    const email  = contact?.email || '';
    if (channel === 'call' && phone)       window.open(`tel:${phone}`, '_self');
    if (channel === 'whatsapp' && digits)  window.open(`https://wa.me/${digits}`, '_blank');
    if (channel === 'email' && email)      window.open(`mailto:${email}`, '_self');
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      await api.patch(`/workspaces/${workspaceId}/contacts/${deal.contact_id}/lead-profile`, {
        leadStatus: profileForm.lead_status || null,
        clientType: profileForm.client_type || null,
        clientDevelopmentId: profileForm.client_development_id || null,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally { setSavingProfile(false); }
  }

  const tabs: { key: ModalTab; label: string }[] = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'notes', label: `Notas${notes.length ? ` (${notes.length})` : ''}` },
    { key: 'offered', label: `Apresentados${offered.length ? ` (${offered.length})` : ''}` },
    { key: 'contact-history', label: `Contatos${attempts.length ? ` (${attempts.length})` : ''}` },
    ...(isAdmin ? [{ key: 'lead-profile' as ModalTab, label: 'Perfil do Lead' }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900 truncate">{deal.title}</div>
            <div className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{deal.contact_name}</span>
              {deal.contact_phone && <span className="text-gray-400">· {deal.contact_phone}</span>}
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium ml-1"
                style={{ backgroundColor: `${deal.stage_color}22`, color: deal.stage_color }}
              >
                {deal.stage_name}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-2 overflow-x-auto flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'text-sm py-2.5 px-3 border-b-2 whitespace-nowrap transition-colors',
                tab === t.key
                  ? 'border-brand-500 text-brand-600 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ── Visão Geral ── */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Quick actions */}
              <div className="flex gap-2 flex-wrap">
                {(deal.contact_phone || contact?.phone) && (
                  <button
                    onClick={() => handleContactAttempt('call')}
                    className="btn-secondary text-xs flex items-center gap-1.5 flex-1 justify-center min-w-[80px]"
                    title="Registra ligação e abre discagem"
                  >
                    <PhoneCall className="w-4 h-4" /> Ligar
                  </button>
                )}
                {(deal.contact_phone || contact?.phone) && (
                  <button
                    onClick={() => handleContactAttempt('whatsapp')}
                    className="btn-secondary text-xs flex items-center gap-1.5 flex-1 justify-center min-w-[100px]"
                    title="Registra contato e abre WhatsApp"
                  >
                    <MessageSquare className="w-4 h-4" /> WhatsApp
                  </button>
                )}
                {contact?.email && (
                  <button
                    onClick={() => handleContactAttempt('email')}
                    className="btn-secondary text-xs flex items-center gap-1.5 flex-1 justify-center min-w-[80px]"
                    title="Registra contato e abre e-mail"
                  >
                    <Mail className="w-4 h-4" /> E-mail
                  </button>
                )}
                {deal.conversation_id && (!restrictConversations || isAdmin) && (
                  <button
                    onClick={() => router.push(`/dashboard/conversations?id=${deal.conversation_id}`)}
                    className="btn-secondary text-xs flex items-center gap-1.5 px-3"
                    title="Abrir conversa"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Value */}
              {deal.value > 0 && (
                <div className="text-sm font-semibold text-green-700">{currencyFmt.format(deal.value)}</div>
              )}

              {/* Contact info */}
              {contact && (contact.email || contact.phone) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Contato</div>
                  {contact.email && <div className="text-sm text-gray-700">{contact.email}</div>}
                  {contact.phone && <div className="text-sm text-gray-700">{contact.phone}</div>}
                </div>
              )}

              {/* AI Summary */}
              {contact?.ai_profile?.resumo && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">Resumo IA</div>
                  <p className="text-sm text-blue-900 leading-relaxed">{contact.ai_profile.resumo}</p>
                  {contact.ai_profile.perfil && (
                    <p className="text-xs text-blue-700 mt-1.5">Perfil: {contact.ai_profile.perfil}</p>
                  )}
                  <div className="flex gap-3 mt-1.5 text-xs text-blue-700 flex-wrap">
                    {contact.ai_profile.cidade && <span>Cidade: {contact.ai_profile.cidade}</span>}
                    {contact.ai_profile.tipo_imovel && <span>Tipo: {contact.ai_profile.tipo_imovel}</span>}
                  </div>
                </div>
              )}

              {/* Admin-only status badges */}
              {isAdmin && contact && (contact.lead_status || contact.client_type) && (
                <div className="flex gap-2 flex-wrap">
                  {contact.lead_status && (
                    <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                      {{ em_prospeccao: 'Em prospecção', em_atendimento: 'Em atendimento', cliente_ativo: 'Cliente ativo' }[contact.lead_status]}
                    </span>
                  )}
                  {contact.client_type && (
                    <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                      {{ aluguel: 'Aluguel', venda: 'Venda' }[contact.client_type]}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Notas ── */}
          {tab === 'notes' && (
            <div className="space-y-3">
              {loadingNotes ? (
                <div className="text-sm text-gray-400 text-center py-6">Carregando...</div>
              ) : notes.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Nenhuma nota ainda.</div>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {isAdmin && note.broker_name && (
                          <div className="text-xs font-medium text-gray-500 mb-1">{note.broker_name}</div>
                        )}
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{note.content}</p>
                        <div className="text-xs text-gray-400 mt-1.5">
                          {format(new Date(note.created_at), "d 'de' MMM, HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteNote(note.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="flex gap-2 pt-1">
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Nova nota privada..."
                  rows={3}
                  className="input flex-1 text-sm resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }}
                />
                <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()}
                  className="btn-primary px-3 self-end disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-400">Ctrl+Enter para salvar · Visível apenas para você{isAdmin ? ' e administradores' : ''}</p>
            </div>
          )}

          {/* ── Itens Apresentados ── */}
          {tab === 'offered' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Histórico compartilhado entre corretores</span>
                <button onClick={() => setShowAddOffered(v => !v)}
                  className="btn-secondary text-xs flex items-center gap-1.5 px-3">
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </div>

              {/* Add form */}
              {showAddOffered && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50">
                  <div className="flex gap-2">
                    <button onClick={() => setOfferedType('development')}
                      className={clsx('flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors',
                        offeredType === 'development' ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      <Building2 className="w-3.5 h-3.5 inline mr-1" /> Empreendimento
                    </button>
                    <button onClick={() => setOfferedType('property')}
                      className={clsx('flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors',
                        offeredType === 'property' ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      <Home className="w-3.5 h-3.5 inline mr-1" /> Imóvel
                    </button>
                  </div>

                  {offeredType === 'development' && (
                    <select value={selectedDevId} onChange={e => setSelectedDevId(e.target.value)} className="input w-full text-sm">
                      <option value="">Selecione o empreendimento</option>
                      {developments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}

                  {offeredType === 'property' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={propSearch}
                        onChange={e => { setPropSearch(e.target.value); setSelectedPropId(''); }}
                        placeholder="Buscar imóvel por código ou título..."
                        className="input w-full text-sm"
                      />
                      {propResults.length > 0 && (
                        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 max-h-40 overflow-y-auto">
                          {propResults.map(p => (
                            <button key={p.id} onClick={() => { setSelectedPropId(p.id); setPropSearch(`${p.code} — ${p.title}`); setPropResults([]); }}
                              className={clsx('w-full text-left px-3 py-2 text-xs hover:bg-gray-50', selectedPropId === p.id && 'bg-brand-50')}>
                              {p.code} — {p.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <input type="text" value={offeredNotes} onChange={e => setOfferedNotes(e.target.value)}
                    placeholder="Observação (opcional)" className="input w-full text-sm" />

                  <div className="flex gap-2">
                    <button onClick={() => setShowAddOffered(false)} className="btn-secondary text-xs flex-1">Cancelar</button>
                    <button onClick={handleAddOffered} disabled={savingOffered || (offeredType === 'property' ? !selectedPropId : !selectedDevId)}
                      className="btn-primary text-xs flex-1 disabled:opacity-50">
                      {savingOffered ? 'Salvando...' : 'Registrar'}
                    </button>
                  </div>
                </div>
              )}

              {/* List */}
              {loadingOffered ? (
                <div className="text-sm text-gray-400 text-center py-6">Carregando...</div>
              ) : offered.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-6">Nenhum item apresentado ainda.</div>
              ) : (
                offered.map(item => (
                  <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                          {item.property_id
                            ? <><Home className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> {item.property_code} — {item.property_title}</>
                            : <><Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> {item.development_name}</>
                          }
                        </div>
                        {item.notes && <p className="text-xs text-gray-500 mt-1">{item.notes}</p>}
                        <div className="text-xs text-gray-400 mt-1">
                          {item.offerer_name && <span>{item.offerer_name} · </span>}
                          {format(new Date(item.offered_at), "d 'de' MMM, HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteOffered(item.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Histórico de Contatos ── */}
          {tab === 'contact-history' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Registra automaticamente cada vez que um corretor clica em Ligar, WhatsApp ou E-mail.
              </p>
              {loadingAttempts ? (
                <div className="text-sm text-gray-400 text-center py-6">Carregando...</div>
              ) : attempts.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-gray-300 gap-2">
                  <History className="w-8 h-8" />
                  <span className="text-sm text-gray-400">Nenhuma tentativa registrada ainda.</span>
                  <span className="text-xs text-gray-400">Use os botões Ligar, WhatsApp ou E-mail para registrar.</span>
                </div>
              ) : (
                attempts.map(a => {
                  const channelLabel = { call: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail' }[a.channel];
                  const channelIcon  = a.channel === 'call'
                    ? <PhoneCall className="w-3.5 h-3.5 text-green-600" />
                    : a.channel === 'whatsapp'
                    ? <MessageSquare className="w-3.5 h-3.5 text-green-500" />
                    : <Mail className="w-3.5 h-3.5 text-blue-500" />;
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      {channelIcon}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 font-medium">{channelLabel}</div>
                        <div className="text-xs text-gray-500">{a.broker_name}</div>
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        {format(new Date(a.created_at), "d 'de' MMM, HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Perfil do Lead (admin only) ── */}
          {tab === 'lead-profile' && isAdmin && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Estes campos ficam vinculados ao contato e persistem entre atendimentos.
                Visível apenas para administradores.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status do Lead</label>
                <select value={profileForm.lead_status}
                  onChange={e => setProfileForm(f => ({ ...f, lead_status: e.target.value }))}
                  className="input w-full">
                  <option value="">Sem status</option>
                  <option value="em_prospeccao">Em prospecção</option>
                  <option value="em_atendimento">Em atendimento</option>
                  <option value="cliente_ativo">Cliente ativo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tipo de Cliente</label>
                <select value={profileForm.client_type}
                  onChange={e => setProfileForm(f => ({ ...f, client_type: e.target.value }))}
                  className="input w-full">
                  <option value="">Sem tipo</option>
                  <option value="aluguel">Aluguel</option>
                  <option value="venda">Venda</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Empreendimento de Interesse</label>
                <select value={profileForm.client_development_id}
                  onChange={e => setProfileForm(f => ({ ...f, client_development_id: e.target.value }))}
                  className="input w-full">
                  <option value="">Nenhum</option>
                  {developments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <button onClick={handleSaveProfile} disabled={savingProfile}
                className="btn-primary w-full disabled:opacity-50">
                {profileSaved ? '✓ Salvo' : savingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function MeusLeadsPage() {
  const { currentWorkspace, user, currentOrg } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const isAdmin = !!(
    user?.is_super_admin ||
    currentOrg?.role === 'owner' ||
    currentOrg?.role === 'admin' ||
    currentWorkspace?.role === 'admin' ||
    currentWorkspace?.role === undefined
  );

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const qs = isAdmin ? '?all=true' : '';
      const res = await api.get<Deal[]>(`/workspaces/${currentWorkspace.id}/kanban/my-deals${qs}`);
      setDeals(res.data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const stages = useMemo(() => derivedStages(deals), [deals]);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const d of deals) {
      if (map[d.stage_id]) map[d.stage_id].push(d);
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return map;
  }, [deals, stages]);

  async function handleDragEnd(result: DropResult) {
    if (!result.destination || !currentWorkspace) return;
    const { draggableId, destination } = result;
    const newStageId = destination.droppableId;
    const deal = deals.find(d => d.id === draggableId);
    if (!deal || deal.stage_id === newStageId) return;

    const targetStage = stages.find(s => s.id === newStageId);
    if (!targetStage) return;

    setDeals(prev => prev.map(d =>
      d.id === draggableId
        ? { ...d, stage_id: newStageId, stage_name: targetStage.name, stage_color: targetStage.color, stage_position: targetStage.position }
        : d
    ));

    try {
      await api.put(`/workspaces/${currentWorkspace.id}/kanban/deals/${draggableId}`, { stageId: newStageId });
    } catch {
      load();
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Meus Leads" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header title={isAdmin ? 'Todos os Leads' : 'Meus Leads'} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : deals.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
          <ListChecks className="w-10 h-10 mb-3 text-gray-200" />
          <p className="text-sm">Nenhum lead encontrado.</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto p-4 pb-6">
            <div className="flex gap-4 h-full" style={{ minWidth: `${Math.max(stages.length * 272, 272)}px` }}>
              {stages.map(stage => {
                const stageDeals = dealsByStage[stage.id] || [];
                return (
                  <div key={stage.id} className="flex flex-col w-64 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold text-gray-700 truncate flex-1">{stage.name}</span>
                      <span className="text-xs text-gray-400 font-medium tabular-nums">{stageDeals.length}</span>
                    </div>

                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={clsx(
                            'flex-1 rounded-xl p-2 space-y-2 transition-colors min-h-24 overflow-y-auto',
                            snapshot.isDraggingOver
                              ? 'bg-brand-50 border-2 border-dashed border-brand-200'
                              : 'bg-gray-100/60',
                          )}
                        >
                          {stageDeals.map((deal, index) => (
                            <Draggable key={deal.id} draggableId={deal.id} index={index}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className={clsx(snap.isDragging && 'opacity-80 rotate-1 shadow-lg')}
                                >
                                  <DealCard deal={deal} onClick={() => setSelectedDeal(deal)} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      )}

      {selectedDeal && (
        <LeadModal
          deal={selectedDeal}
          isAdmin={isAdmin}
          workspaceId={currentWorkspace.id}
          restrictConversations={currentWorkspace.restrict_conversations ?? false}
          onClose={() => setSelectedDeal(null)}
        />
      )}
    </>
  );
}
