'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Inbox } from '@/types';
import { Plus, Wifi, WifiOff, Loader, QrCode, Trash2, ChevronDown, ChevronRight, Bot, Users, MessagesSquare, UserPlus, UserMinus } from 'lucide-react';

interface InboxEditForm {
  autoAssign?: boolean;
  chatbotEnabled?: boolean;
  chatbotPrompt?: string;
  groupsEnabled?: boolean;
  wabaPhoneNumberId?: string;
  wabaAccessToken?: string;
  wabaBusinessId?: string;
}

interface InboxMember { user_id: string; name: string; email: string; avatar_url: string | null; }
interface WsMember    { user_id: string; name: string; email: string; }

export default function InboxesPage() {
  const { currentWorkspace, currentOrg } = useAuth();
  const [inboxes,      setInboxes]      = useState<Inbox[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [qrInbox,      setQrInbox]      = useState<Inbox | null>(null);
  const [creating,     setCreating]     = useState(false);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [editForm,     setEditForm]     = useState<InboxEditForm>({});
  // Membros do inbox
  const [membersInboxId, setMembersInboxId] = useState<string | null>(null);
  const [inboxMembers,   setInboxMembers]   = useState<InboxMember[]>([]);
  const [wsMembers,      setWsMembers]      = useState<WsMember[]>([]);
  const [addingMember,   setAddingMember]   = useState(false);
  const [form, setForm] = useState({
    name: '', channelType: 'whatsapp_evolution',
    evolutionApiUrl: '', evolutionApiKey: '', evolutionInstance: '',
    wabaPhoneNumberId: '', wabaAccessToken: '', wabaBusinessId: '', phoneNumber: '',
  });

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/inboxes`);
    setInboxes(data);
    setLoading(false);
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace) return;
    await api.post(`/workspaces/${currentWorkspace.id}/inboxes`, form);
    setCreating(false);
    setForm({
      name: '', channelType: 'whatsapp_evolution',
      evolutionApiUrl: '', evolutionApiKey: '', evolutionInstance: '',
      wabaPhoneNumberId: '', wabaAccessToken: '', wabaBusinessId: '', phoneNumber: '',
    });
    load();
  }

  async function handleSaveSettings(inboxId: string) {
    if (!currentWorkspace) return;
    const payload: Record<string, unknown> = { ...editForm };
    // Não envia token vazio (manter o atual no backend)
    if (!payload.wabaAccessToken) delete payload.wabaAccessToken;
    await api.put(`/workspaces/${currentWorkspace.id}/inboxes/${inboxId}`, payload);
    setExpandedId(null);
    setEditForm({});
    load();
  }

  async function openMembers(inboxId: string) {
    if (!currentWorkspace || !currentOrg) return;
    setMembersInboxId(inboxId);
    const [{ data: im }, { data: wm }] = await Promise.all([
      api.get(`/workspaces/${currentWorkspace.id}/inboxes/${inboxId}/members`),
      api.get(`/orgs/${currentOrg.id}/workspaces/${currentWorkspace.id}/members`),
    ]);
    setInboxMembers(im);
    setWsMembers(wm);
  }

  async function handleAddInboxMember(userId: string) {
    if (!currentWorkspace || !membersInboxId) return;
    setAddingMember(true);
    try {
      const { data } = await api.post(
        `/workspaces/${currentWorkspace.id}/inboxes/${membersInboxId}/members`,
        { userId }
      );
      setInboxMembers(prev => [...prev, data]);
    } finally { setAddingMember(false); }
  }

  async function handleRemoveInboxMember(userId: string) {
    if (!currentWorkspace || !membersInboxId) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/inboxes/${membersInboxId}/members/${userId}`);
    setInboxMembers(prev => prev.filter(m => m.user_id !== userId));
  }

  async function handleDelete(inboxId: string) {
    if (!currentWorkspace || !confirm('Remover este inbox?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/inboxes/${inboxId}`);
    load();
  }

  function toggleExpand(inbox: Inbox) {
    if (expandedId === inbox.id) {
      setExpandedId(null);
      setEditForm({});
    } else {
      setExpandedId(inbox.id);
      setEditForm({
        autoAssign:        inbox.auto_assign,
        chatbotEnabled:    inbox.chatbot_enabled,
        chatbotPrompt:     inbox.chatbot_prompt || '',
        groupsEnabled:     (inbox as any).groups_enabled ?? false,
        wabaPhoneNumberId: (inbox as any).waba_phone_number_id || '',
        wabaAccessToken:   '',
        wabaBusinessId:    (inbox as any).waba_business_id || '',
      });
    }
  }

  const statusBadge = (inbox: Inbox) => {
    if (inbox.channel_type === 'whatsapp_official') {
      if (inbox.connection_status === 'connected')
        return <span className="badge-green flex items-center gap-1"><Wifi className="w-3 h-3" />Ativo</span>;
      return <span className="badge-blue flex items-center gap-1"><Wifi className="w-3 h-3" />API Oficial</span>;
    }
    if (inbox.connection_status === 'connected')  return <span className="badge-green flex items-center gap-1"><Wifi className="w-3 h-3" />Conectado</span>;
    if (inbox.connection_status === 'connecting') return <span className="badge-yellow flex items-center gap-1"><Loader className="w-3 h-3 animate-spin" />Conectando</span>;
    return <span className="badge-red flex items-center gap-1"><WifiOff className="w-3 h-3" />Desconectado</span>;
  };

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Inboxes" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Inboxes"
        actions={
          <button className="btn-primary text-sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" />
            Novo inbox
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Create form */}
        {creating && (
          <div className="card p-6 mb-6 max-w-lg">
            <h2 className="font-semibold text-gray-900 mb-4">Criar novo inbox</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: WhatsApp Vendas" />
              </div>

              {/* Tipo de canal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de canal</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, channelType: 'whatsapp_evolution' })}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${form.channelType === 'whatsapp_evolution' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="text-sm font-medium text-gray-900">Evolution API</div>
                    <div className="text-xs text-gray-500 mt-0.5">WhatsApp Web (não oficial)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, channelType: 'whatsapp_official' })}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${form.channelType === 'whatsapp_official' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="text-sm font-medium text-gray-900">API Oficial Meta</div>
                    <div className="text-xs text-gray-500 mt-0.5">WhatsApp Business Cloud</div>
                  </button>
                </div>
              </div>

              {/* Campos Evolution */}
              {form.channelType === 'whatsapp_evolution' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Evolution API URL</label>
                    <input className="input" value={form.evolutionApiUrl} onChange={(e) => setForm({ ...form, evolutionApiUrl: e.target.value })} placeholder="https://evolution.meuserver.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                    <input className="input" value={form.evolutionApiKey} onChange={(e) => setForm({ ...form, evolutionApiKey: e.target.value })} placeholder="sua-api-key" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Instance name</label>
                    <input className="input" value={form.evolutionInstance} onChange={(e) => setForm({ ...form, evolutionInstance: e.target.value })} placeholder="minha-instancia" />
                  </div>
                </>
              )}

              {/* Campos WABA */}
              {form.channelType === 'whatsapp_official' && (
                <>
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-800">
                    Precisa de uma conta aprovada no <strong>WhatsApp Business Platform</strong> (Meta Business Suite). O número não pode estar ativo no WhatsApp comum.
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
                    <input className="input" value={form.wabaPhoneNumberId} onChange={(e) => setForm({ ...form, wabaPhoneNumberId: e.target.value })} placeholder="123456789012345" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Access Token (System User)</label>
                    <input className="input" type="password" value={form.wabaAccessToken} onChange={(e) => setForm({ ...form, wabaAccessToken: e.target.value })} placeholder="EAAxxxxxxx..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Business Account ID</label>
                    <input className="input" value={form.wabaBusinessId} onChange={(e) => setForm({ ...form, wabaBusinessId: e.target.value })} placeholder="123456789012345" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número de telefone</label>
                    <input className="input" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+5511999999999" />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary">Criar</button>
                <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {/* QR Code modal */}
        {qrInbox?.qr_code && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQrInbox(null)}>
            <div className="card p-6 text-center" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-gray-900 mb-4">Escanear QR Code — {qrInbox.name}</h3>
              <img src={`data:image/png;base64,${qrInbox.qr_code}`} alt="QR Code" className="w-64 h-64 mx-auto" />
              <p className="text-sm text-gray-500 mt-3">Abra o WhatsApp e escaneie este código</p>
              <button className="btn-secondary mt-4" onClick={() => setQrInbox(null)}>Fechar</button>
            </div>
          </div>
        )}

        {/* Inboxes list */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-5 h-32 animate-pulse bg-gray-50" />
            ))
          ) : inboxes.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-gray-400">
              Nenhum inbox criado ainda. Crie o primeiro!
            </div>
          ) : (
            inboxes.map((inbox) => (
              <div key={inbox.id} className="card">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{inbox.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{inbox.channel_type}</p>
                    </div>
                    {statusBadge(inbox)}
                  </div>

                  {inbox.phone_number && <p className="text-sm text-gray-600 mb-3">{inbox.phone_number}</p>}

                  {/* Feature badges */}
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {inbox.auto_assign && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        <Users className="w-3 h-3" />Auto-assign
                      </span>
                    )}
                    {inbox.chatbot_enabled && (
                      <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                        <Bot className="w-3 h-3" />Chatbot
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {inbox.qr_code && (
                      <button className="btn-secondary text-xs" onClick={() => setQrInbox(inbox)}>
                        <QrCode className="w-3.5 h-3.5" />QR Code
                      </button>
                    )}
                    <button
                      className="btn-secondary text-xs flex items-center gap-1"
                      onClick={() => toggleExpand(inbox)}
                    >
                      {expandedId === inbox.id
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                      Configurações
                    </button>
                    <button
                      className="btn-ghost text-xs text-red-500 hover:bg-red-50 ml-auto"
                      onClick={() => handleDelete(inbox.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {inbox.channel_type === 'whatsapp_official' ? (
                    <div className="mt-3 space-y-1 text-xs text-gray-400">
                      <div>
                        <span>Webhook URL </span><span className="text-gray-300">(único para todos os números):</span>
                        <br />
                        <code className="text-green-400 select-all break-all">
                          {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/webhooks/waba` : '/api/v1/webhooks/waba'}
                        </code>
                      </div>
                      <div>
                        <span>Verify Token </span><span className="text-gray-300">(env <code>WABA_VERIFY_TOKEN</code>):</span>
                        <span className="ml-1 text-amber-400">defina no .env do servidor</span>
                      </div>
                      <div>
                        <span>Phone Number ID desta inbox: </span>
                        <code className="text-green-400 select-all">{(inbox as any).waba_phone_number_id || '—'}</code>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-gray-400">
                      <span>Webhook URL: </span>
                      <code className="text-brand-600 select-all break-all">
                        {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/webhooks/evolution/${inbox.id}` : `/api/v1/webhooks/evolution/${inbox.id}`}
                      </code>
                    </div>
                  )}
                </div>

                {/* Expanded settings panel */}
                {expandedId === inbox.id && (
                  <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50 rounded-b-xl">
                    <h4 className="text-sm font-semibold text-gray-700">Configurações avançadas</h4>

                    {/* Auto-assign toggle */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-blue-500" />
                          Auto-assign (round-robin)
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">Distribui novas conversas automaticamente entre agentes do departamento</p>
                      </div>
                      <button
                        onClick={() => setEditForm(prev => ({ ...prev, autoAssign: !prev.autoAssign }))}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${editForm.autoAssign ? 'bg-brand-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${editForm.autoAssign ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {/* Chatbot toggle */}
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <Bot className="w-4 h-4 text-purple-500" />
                            Chatbot IA (Claude)
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Responde automaticamente enquanto não há agente atribuído</p>
                        </div>
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, chatbotEnabled: !prev.chatbotEnabled }))}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${editForm.chatbotEnabled ? 'bg-brand-600' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${editForm.chatbotEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                      {editForm.chatbotEnabled && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Prompt do chatbot</label>
                          <textarea
                            rows={4}
                            className="input text-sm resize-none"
                            placeholder="Você é um assistente de atendimento. Responda em português de forma educada e direcione o cliente para..."
                            value={editForm.chatbotPrompt || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, chatbotPrompt: e.target.value }))}
                          />
                          <p className="text-xs text-gray-400 mt-1">Requer chave da API Anthropic configurada nas configurações do workspace.</p>
                        </div>
                      )}
                    </div>

                    {/* Groups toggle — apenas Evolution */}
                    {inboxes.find(i => i.id === expandedId)?.channel_type !== 'whatsapp_official' && (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <MessagesSquare className="w-4 h-4 text-green-500" />
                            Receber mensagens de grupos
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Captura todas as mensagens enviadas e recebidas em grupos do WhatsApp</p>
                        </div>
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, groupsEnabled: !prev.groupsEnabled }))}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${editForm.groupsEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${editForm.groupsEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    )}

                    {/* Credenciais WABA — só para API Oficial */}
                    {inbox.channel_type === 'whatsapp_official' && (
                      <div className="space-y-3 border-t border-gray-200 pt-4">
                        <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Credenciais API Oficial (WABA)</h5>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number ID</label>
                          <input
                            className="input text-sm font-mono"
                            value={editForm.wabaPhoneNumberId || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, wabaPhoneNumberId: e.target.value }))}
                            placeholder="189333882860427"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">WABA Business Account ID</label>
                          <input
                            className="input text-sm font-mono"
                            value={editForm.wabaBusinessId || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, wabaBusinessId: e.target.value }))}
                            placeholder="430991275702132"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Access Token <span className="text-gray-400 font-normal">(deixe em branco para manter o atual)</span>
                          </label>
                          <input
                            type="password"
                            className="input text-sm font-mono"
                            value={editForm.wabaAccessToken || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, wabaAccessToken: e.target.value }))}
                            placeholder="Novo token de usuário do sistema..."
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <button className="btn-primary text-sm" onClick={() => handleSaveSettings(inbox.id)}>Salvar configurações</button>
                      <button
                        className="btn-secondary text-sm flex items-center gap-1.5"
                        onClick={() => openMembers(inbox.id)}
                        type="button"
                      >
                        <Users className="w-3.5 h-3.5" /> Gerenciar Agentes
                      </button>
                      <button className="btn-secondary text-sm" onClick={() => { setExpandedId(null); setEditForm({}); }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de membros do inbox */}
      {membersInboxId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
             onClick={() => setMembersInboxId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-500" />
                Agentes do Inbox
              </h2>
              <button onClick={() => setMembersInboxId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Agentes vinculados aqui só verão conversas deste inbox.
              Agentes sem vínculo veem todas as conversas não atribuídas.
            </p>

            {/* Agentes já vinculados */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {inboxMembers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum agente vinculado ainda.</p>
              ) : inboxMembers.map(m => (
                <div key={m.user_id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm flex-shrink-0">
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{m.name}</div>
                    <div className="text-xs text-gray-400 truncate">{m.email}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveInboxMember(m.user_id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remover do inbox"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Adicionar agente */}
            <div className="border-t pt-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Adicionar agente:</p>
              <div className="flex gap-2 flex-wrap">
                {wsMembers
                  .filter(m => !inboxMembers.find(im => im.user_id === m.user_id))
                  .map(m => (
                    <button
                      key={m.user_id}
                      onClick={() => handleAddInboxMember(m.user_id)}
                      disabled={addingMember}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200
                                 rounded-full hover:border-brand-400 hover:text-brand-700 transition-colors"
                    >
                      <UserPlus className="w-3 h-3" />
                      {m.name}
                    </button>
                  ))}
                {wsMembers.filter(m => !inboxMembers.find(im => im.user_id === m.user_id)).length === 0 && (
                  <p className="text-xs text-gray-400">Todos os agentes já estão vinculados.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
