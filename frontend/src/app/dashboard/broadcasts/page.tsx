'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { Plus, Play, Pause, X, Send, Users, CheckCircle, AlertCircle, Clock, ChevronRight, Trash2, RefreshCw, LayoutTemplate } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Inbox { id: string; name: string; channel_type: string; }
interface Contact { id: string; name: string; phone: string; tags: string[]; }
interface WabaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: Array<{ type: string; format?: string; text?: string }>;
}
interface Broadcast {
  id: string; name: string; status: string;
  inbox_id: string; inbox_name: string; channel_type: string;
  message_type: string; content: string | null;
  total_contacts: number; sent_count: number; delivered_count: number;
  read_count: number; failed_count: number;
  scheduled_at: string | null; started_at: string | null; finished_at: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:      { label: 'Rascunho',  color: 'bg-gray-100 text-gray-600' },
  scheduled:  { label: 'Agendado',  color: 'bg-blue-100 text-blue-700' },
  running:    { label: 'Enviando',  color: 'bg-yellow-100 text-yellow-700' },
  paused:     { label: 'Pausado',   color: 'bg-orange-100 text-orange-700' },
  done:       { label: 'Concluído', color: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Cancelado', color: 'bg-red-100 text-red-600' },
};

// ── Helpers para templates WABA ───────────────────────────────────────────────

function getBodyText(t: WabaTemplate): string {
  return t.components.find(c => c.type === 'BODY')?.text || '';
}

function countVars(text: string): number {
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) : 0;
}

function buildTemplateContent(t: WabaTemplate, vars: string[]): string {
  const components: unknown[] = [];
  if (vars.length > 0) {
    components.push({
      type: 'body',
      parameters: vars.map(v => ({ type: 'text', text: v })),
    });
  }
  return JSON.stringify({
    name: t.name,
    language: { code: t.language },
    components,
  });
}

// ── Modal de criação ──────────────────────────────────────────────────────────

interface CreateForm {
  name: string; inboxId: string; messageType: string; content: string;
  sendIntervalMs: number; filterTags: string;
}

function CreateBroadcastModal({ workspaceId, inboxes, onClose, onCreated }: {
  workspaceId: string;
  inboxes: Inbox[];
  onClose: () => void;
  onCreated: (b: Broadcast) => void;
}) {
  const [form, setForm] = useState<CreateForm>({
    name: '', inboxId: inboxes[0]?.id || '', messageType: 'text',
    content: '', sendIntervalMs: 1500, filterTags: '',
  });
  const [contacts, setContacts]         = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [loadingC, setLoadingC]         = useState(false);
  const [search, setSearch]             = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [page, setPage]                 = useState(1);
  const [total, setTotal]               = useState(0);
  // template state
  const [templates, setTemplates]       = useState<WabaTemplate[]>([]);
  const [loadingT, setLoadingT]         = useState(false);
  const [syncingT, setSyncingT]         = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WabaTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);

  const selectedInbox = inboxes.find(i => i.id === form.inboxId);
  const isWaba        = selectedInbox?.channel_type === 'whatsapp_official';

  // Carrega contatos
  const loadContacts = useCallback(async () => {
    setLoadingC(true);
    try {
      const params: Record<string, unknown> = { page, limit: 50 };
      if (search) params.search = search;
      const { data } = await api.get(`/workspaces/${workspaceId}/contacts`, { params });
      setContacts(data.data);
      setTotal(data.total);
    } finally { setLoadingC(false); }
  }, [workspaceId, search, page]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Carrega templates quando inbox WABA for selecionada
  const loadTemplates = useCallback(async (inboxId: string) => {
    setLoadingT(true);
    try {
      const { data } = await api.get(`/workspaces/${workspaceId}/broadcasts/templates/${inboxId}`);
      setTemplates(data);
    } catch { setTemplates([]); }
    finally { setLoadingT(false); }
  }, [workspaceId]);

  useEffect(() => {
    if (isWaba) {
      loadTemplates(form.inboxId);
      setForm(p => ({ ...p, messageType: 'template' }));
    } else {
      setTemplates([]);
      setSelectedTemplate(null);
      setTemplateVars([]);
      setForm(p => ({ ...p, messageType: 'text' }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.inboxId]);

  async function handleSyncTemplates() {
    setSyncingT(true);
    try {
      await api.post(`/workspaces/${workspaceId}/broadcasts/templates/${form.inboxId}/sync`);
      await loadTemplates(form.inboxId);
    } catch {
      setError('Erro ao sincronizar templates. Verifique as credenciais da inbox WABA.');
    } finally { setSyncingT(false); }
  }

  function handleSelectTemplate(t: WabaTemplate) {
    setSelectedTemplate(t);
    const n = countVars(getBodyText(t));
    setTemplateVars(Array(n).fill(''));
    setForm(p => ({ ...p, content: '' }));
  }

  function toggleContact(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(contacts.filter(c => c.phone).map(c => c.id)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim())  { setError('Nome é obrigatório'); return; }
    if (!form.inboxId)      { setError('Selecione uma inbox'); return; }

    if (isWaba) {
      if (!selectedTemplate) { setError('Selecione um template aprovado'); return; }
    } else {
      if (!form.content.trim()) { setError('Mensagem é obrigatória'); return; }
    }

    if (selectedIds.size === 0 && !form.filterTags.trim()) {
      setError('Selecione ao menos um contato ou defina filtro por tags'); return;
    }

    setSaving(true); setError('');
    try {
      const tags = form.filterTags.trim()
        ? form.filterTags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined;

      const content = isWaba && selectedTemplate
        ? buildTemplateContent(selectedTemplate, templateVars)
        : form.content;

      const { data } = await api.post(`/workspaces/${workspaceId}/broadcasts`, {
        name:           form.name,
        inboxId:        form.inboxId,
        messageType:    isWaba ? 'template' : form.messageType,
        content,
        sendIntervalMs: form.sendIntervalMs,
        contactIds:     [...selectedIds],
        filterTags:     tags,
      });
      onCreated(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao criar');
    } finally { setSaving(false); }
  }

  const bodyText         = selectedTemplate ? getBodyText(selectedTemplate) : '';
  const varCount         = countVars(bodyText);
  const previewText      = templateVars.reduce((t, v, i) => t.replaceAll(`{{${i + 1}}}`, v || `{{${i + 1}}}`), bodyText);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900 text-lg">Novo broadcast</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome da campanha *</label>
              <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Black Friday 2025" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Inbox *</label>
              <select className="input" value={form.inboxId} onChange={e => setForm(p => ({ ...p, inboxId: e.target.value }))}>
                {inboxes.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.channel_type === 'whatsapp_official' ? 'Oficial' : 'Evolution'})</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Seleção de template (WABA) ── */}
          {isWaba && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  Template aprovado *
                </label>
                <button
                  type="button"
                  onClick={handleSyncTemplates}
                  disabled={syncingT}
                  className="text-xs text-brand-600 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${syncingT ? 'animate-spin' : ''}`} />
                  {syncingT ? 'Sincronizando...' : 'Sincronizar da Meta'}
                </button>
              </div>

              {loadingT ? (
                <div className="text-xs text-gray-400 py-2">Carregando templates...</div>
              ) : templates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                  Nenhum template encontrado. Clique em <strong>Sincronizar da Meta</strong> para buscar os templates aprovados.
                </div>
              ) : (
                <div className="grid gap-2 max-h-44 overflow-y-auto pr-1">
                  {templates.filter(t => t.status === 'APPROVED').map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                        selectedTemplate?.id === t.id
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{t.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Aprovado</span>
                          <span className="text-xs text-gray-400">{t.language}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{getBodyText(t)}</p>
                    </button>
                  ))}
                  {templates.filter(t => t.status !== 'APPROVED').map(t => (
                    <div key={t.id} className="text-left rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 opacity-50 cursor-not-allowed">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">{t.name}</span>
                        <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Variáveis do template */}
              {selectedTemplate && varCount > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-600">Variáveis do template</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: varCount }, (_, i) => (
                      <div key={i}>
                        <label className="text-xs text-gray-500 mb-1 block">{`{{${i + 1}}}`}</label>
                        <input
                          className="input text-sm"
                          placeholder={`Valor para {{${i + 1}}}`}
                          value={templateVars[i] || ''}
                          onChange={e => {
                            const next = [...templateVars];
                            next[i] = e.target.value;
                            setTemplateVars(next);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {selectedTemplate && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Preview</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{previewText}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Mensagem livre (Evolution) ── */}
          {!isWaba && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem *</label>
              <textarea
                className="input resize-none"
                rows={4}
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="Olá! Temos uma novidade especial para você..."
              />
              <p className="text-xs text-gray-400 mt-1">{form.content.length} caracteres</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Intervalo entre envios</label>
              <select className="input" value={form.sendIntervalMs} onChange={e => setForm(p => ({ ...p, sendIntervalMs: +e.target.value }))}>
                <option value={500}>500ms (rápido — só Evolution)</option>
                <option value={1000}>1s</option>
                <option value={1500}>1.5s (recomendado)</option>
                <option value={3000}>3s (conservador)</option>
                <option value={5000}>5s (muito seguro)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Filtrar por tags</label>
              <input
                className="input"
                value={form.filterTags}
                onChange={e => setForm(p => ({ ...p, filterTags: e.target.value }))}
                placeholder="lead, premium"
              />
              <p className="text-xs text-gray-400 mt-1">Separe por vírgula</p>
            </div>
          </div>

          {/* Seleção de contatos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                Contatos ({selectedIds.size} selecionados de {total})
              </label>
              <button type="button" onClick={selectAll} className="text-xs text-brand-600 hover:underline">
                Selecionar todos da página
              </button>
            </div>

            <div className="relative mb-2">
              <input
                className="input pl-8 text-sm"
                placeholder="Buscar contatos..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100">
              {loadingC ? (
                <div className="py-4 text-center text-sm text-gray-400">Carregando...</div>
              ) : contacts.length === 0 ? (
                <div className="py-4 text-center text-sm text-gray-400">Nenhum contato encontrado</div>
              ) : contacts.map(c => (
                <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${!c.phone ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => c.phone && toggleContact(c.id)}
                    disabled={!c.phone}
                    className="accent-brand-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.phone || 'sem telefone'}</div>
                  </div>
                  {c.tags?.slice(0, 2).map(t => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t}</span>
                  ))}
                </label>
              ))}
            </div>

            {total > 50 && (
              <div className="flex justify-center gap-2 mt-2">
                <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs py-1">Ant.</button>
                <span className="text-xs text-gray-500 flex items-center">{page} / {Math.ceil(total / 50)}</span>
                <button type="button" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs py-1">Próx.</button>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>

        <div className="px-6 py-4 border-t flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving} className="btn-primary">
            {saving ? 'Criando...' : 'Criar broadcast'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, total, color = 'bg-brand-500' }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function BroadcastsPage() {
  const { currentWorkspace } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [inboxes, setInboxes]       = useState<Inbox[]>([]);
  const [creating, setCreating]     = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [{ data: br }, { data: inx }] = await Promise.all([
        api.get(`/workspaces/${currentWorkspace.id}/broadcasts`),
        api.get(`/workspaces/${currentWorkspace.id}/inboxes`),
      ]);
      setBroadcasts(br.data);
      setTotal(br.total);
      setInboxes(inx.filter((i: Inbox) => ['whatsapp_evolution', 'whatsapp_official'].includes(i.channel_type)));
    } finally { setLoading(false); }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hasRunning = broadcasts.some(b => b.status === 'running');
    if (!hasRunning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [broadcasts, load]);

  async function handleStart(id: string) {
    if (!currentWorkspace) return;
    await api.post(`/workspaces/${currentWorkspace.id}/broadcasts/${id}/start`);
    load();
  }

  async function handlePause(id: string) {
    if (!currentWorkspace) return;
    await api.post(`/workspaces/${currentWorkspace.id}/broadcasts/${id}/pause`);
    load();
  }

  async function handleCancel(id: string) {
    if (!currentWorkspace || !confirm('Cancelar este broadcast?')) return;
    await api.post(`/workspaces/${currentWorkspace.id}/broadcasts/${id}/cancel`);
    load();
  }

  async function handleDelete(id: string) {
    if (!currentWorkspace || !confirm('Excluir este broadcast?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/broadcasts/${id}`);
    setBroadcasts(prev => prev.filter(b => b.id !== id));
    setTotal(t => t - 1);
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Broadcasts" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`Broadcasts (${total})`}
        actions={
          <button className="btn-primary text-sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" />
            Novo broadcast
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="card h-28 animate-pulse bg-gray-50" />)}
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Send className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Nenhum broadcast ainda</p>
            <p className="text-sm mt-1">Crie uma campanha de envio em massa</p>
            <button className="btn-primary mt-4" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> Criar broadcast
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => {
              const cfg    = STATUS_CONFIG[b.status] || STATUS_CONFIG.draft;
              const isDone = b.status === 'done';
              const isRun  = b.status === 'running';

              return (
                <div key={b.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{b.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{b.inbox_name}</span>
                        {b.message_type === 'template' && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <LayoutTemplate className="w-3 h-3" /> Template
                          </span>
                        )}
                      </div>

                      {b.total_contacts > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b.total_contacts} contatos</span>
                            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" />{b.sent_count} enviados</span>
                            {b.failed_count > 0 && (
                              <span className="flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" />{b.failed_count} falhas</span>
                            )}
                            {b.read_count > 0 && (
                              <span className="flex items-center gap-1 text-blue-600"><ChevronRight className="w-3 h-3" />{b.read_count} lidos</span>
                            )}
                          </div>
                          <ProgressBar value={b.sent_count} total={b.total_contacts} color={isDone ? 'bg-green-500' : isRun ? 'bg-brand-500' : 'bg-gray-400'} />
                          {isRun && (
                            <p className="text-xs text-brand-600 font-medium flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Enviando... {Math.round((b.sent_count / b.total_contacts) * 100)}%
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {b.created_at && <span>Criado {format(new Date(b.created_at), "d MMM yyyy", { locale: ptBR })}</span>}
                        {b.started_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Iniciado {format(new Date(b.started_at), "d MMM HH:mm", { locale: ptBR })}</span>}
                        {b.finished_at && <span>Concluído {format(new Date(b.finished_at), "d MMM HH:mm", { locale: ptBR })}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {(b.status === 'draft' || b.status === 'paused') && (
                        <button onClick={() => handleStart(b.id)} className="btn-primary text-xs py-1.5" title="Iniciar">
                          <Play className="w-3.5 h-3.5" /> Iniciar
                        </button>
                      )}
                      {b.status === 'running' && (
                        <button onClick={() => handlePause(b.id)} className="btn-secondary text-xs py-1.5" title="Pausar">
                          <Pause className="w-3.5 h-3.5" /> Pausar
                        </button>
                      )}
                      {['draft', 'scheduled', 'running', 'paused'].includes(b.status) && (
                        <button onClick={() => handleCancel(b.id)} className="btn-ghost text-xs py-1.5 text-red-500 hover:bg-red-50" title="Cancelar">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['draft', 'cancelled'].includes(b.status) && (
                        <button onClick={() => handleDelete(b.id)} className="btn-ghost text-xs py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && currentWorkspace && (
        <CreateBroadcastModal
          workspaceId={currentWorkspace.id}
          inboxes={inboxes}
          onClose={() => setCreating(false)}
          onCreated={(b) => {
            setBroadcasts(prev => [b, ...prev]);
            setTotal(t => t + 1);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
