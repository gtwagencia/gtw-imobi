'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { DepartmentOverview } from '@/types';
import {
  Plus, Trash2, Users, MessageSquare,
  Check, X, Pencil, UserPlus, UserMinus, Loader, Sparkles, Save,
  Briefcase, Wallet, Clock, ChevronRight, Gauge, LayoutList,
} from 'lucide-react';
import clsx from 'clsx';

interface Department {
  id: string;
  name: string;
  color: string;
  description: string | null;
  ai_persona: string | null;
  ai_routing_description: string | null;
  agent_count: number;
  conversation_count: number;
}

interface Agent {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  open_conversations?: number;
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
];

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatAvgResponse(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type Tab = 'manage' | 'overview';

export default function DepartmentsPage() {
  const router = useRouter();
  const { currentWorkspace, currentOrg } = useAuth();
  const agentName = currentWorkspace?.ai_agent_name || 'Lia';

  const [tab, setTab] = useState<Tab>('manage');

  // ── Manage tab state ──────────────────────────────────────────────────────
  const [departments,   setDepartments]   = useState<Department[]>([]);
  const [selectedDept,  setSelectedDept]  = useState<Department | null>(null);
  const [deptAgents,    setDeptAgents]    = useState<Agent[]>([]);
  const [unassigned,    setUnassigned]    = useState<Agent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newColor,   setNewColor]   = useState(COLORS[0]);
  const [newDesc,    setNewDesc]    = useState('');
  const [creating,   setCreating]   = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName,  setEditName]  = useState('');

  const [aiPersonaDraft, setAiPersonaDraft] = useState('');
  const [savingPersona,  setSavingPersona]  = useState(false);
  const [personaSaved,   setPersonaSaved]   = useState(false);

  const [routingDraft,  setRoutingDraft]  = useState('');
  const [savingRouting, setSavingRouting] = useState(false);
  const [routingSaved,  setRoutingSaved]  = useState(false);

  // ── Overview tab state ────────────────────────────────────────────────────
  const [overview,        setOverview]        = useState<DepartmentOverview[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const isAdmin = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  const loadDepts = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/departments`);
    setDepartments(data);
    setLoading(false);
  }, [currentWorkspace]);

  const loadOverview = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadingOverview(true);
    try {
      const { data } = await api.get<DepartmentOverview[]>(`/workspaces/${currentWorkspace.id}/departments/overview`);
      setOverview(data);
    } finally {
      setLoadingOverview(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { loadDepts(); }, [loadDepts]);

  useEffect(() => {
    if (tab === 'overview') loadOverview();
  }, [tab, loadOverview]);

  async function selectDept(dept: Department) {
    setSelectedDept(dept);
    setAiPersonaDraft(dept.ai_persona || '');
    setRoutingDraft(dept.ai_routing_description || '');
    setLoadingAgents(true);
    const [agentsRes, unassignedRes] = await Promise.all([
      api.get(`/workspaces/${currentWorkspace!.id}/departments/${dept.id}/agents`),
      api.get(`/workspaces/${currentWorkspace!.id}/departments/unassigned-agents`),
    ]);
    setDeptAgents(agentsRes.data);
    setUnassigned(unassignedRes.data);
    setLoadingAgents(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace) return;
    setCreating(true);
    await api.post(`/workspaces/${currentWorkspace.id}/departments`, {
      name: newName, color: newColor, description: newDesc || undefined,
    });
    setNewName(''); setNewDesc(''); setNewColor(COLORS[0]); setShowCreate(false);
    loadDepts();
    setCreating(false);
  }

  async function handleDelete(deptId: string) {
    if (!currentWorkspace || !confirm('Remover este departamento?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/departments/${deptId}`);
    if (selectedDept?.id === deptId) setSelectedDept(null);
    loadDepts();
  }

  async function handleRename(deptId: string) {
    if (!currentWorkspace || !editName.trim()) return;
    await api.put(`/workspaces/${currentWorkspace.id}/departments/${deptId}`, { name: editName });
    setEditingId(null);
    loadDepts();
  }

  async function handleSavePersona() {
    if (!currentWorkspace || !selectedDept) return;
    setSavingPersona(true);
    try {
      const { data } = await api.put(`/workspaces/${currentWorkspace.id}/departments/${selectedDept.id}`, {
        aiPersona: aiPersonaDraft || null,
      });
      setSelectedDept(data);
      setDepartments(prev => prev.map(d => d.id === data.id ? { ...d, ai_persona: data.ai_persona } : d));
      setPersonaSaved(true);
      setTimeout(() => setPersonaSaved(false), 2000);
    } finally { setSavingPersona(false); }
  }

  async function handleSaveRouting() {
    if (!currentWorkspace || !selectedDept) return;
    setSavingRouting(true);
    try {
      const { data } = await api.put(`/workspaces/${currentWorkspace.id}/departments/${selectedDept.id}`, {
        aiRoutingDescription: routingDraft || null,
      });
      setSelectedDept(data);
      setDepartments(prev => prev.map(d => d.id === data.id ? { ...d, ai_routing_description: data.ai_routing_description } : d));
      setRoutingSaved(true);
      setTimeout(() => setRoutingSaved(false), 2000);
    } finally { setSavingRouting(false); }
  }

  async function handleAssign(userId: string) {
    if (!currentWorkspace || !selectedDept) return;
    await api.post(`/workspaces/${currentWorkspace!.id}/departments/${selectedDept.id}/agents`, { userId });
    selectDept(selectedDept);
    loadDepts();
  }

  async function handleRemoveAgent(userId: string) {
    if (!currentWorkspace || !selectedDept) return;
    await api.delete(`/workspaces/${currentWorkspace!.id}/departments/${selectedDept.id}/agents/${userId}`);
    selectDept(selectedDept);
    loadDepts();
  }

  if (!currentWorkspace) return null;

  return (
    <>
      <Header
        title="Departamentos"
        actions={tab === 'manage' && isAdmin ? (
          <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Novo departamento
          </button>
        ) : undefined}
      />

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-4 md:px-6 flex gap-0 flex-shrink-0">
        <button
          onClick={() => setTab('manage')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
            tab === 'manage'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutList className="w-4 h-4" />
          Gerenciar
        </button>
        <button
          onClick={() => setTab('overview')}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
            tab === 'overview'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <Gauge className="w-4 h-4" />
          Visão Geral
        </button>
      </div>

      {/* ── Manage tab ──────────────────────────────────────────────────────── */}
      {tab === 'manage' && (
        <div className="flex-1 overflow-hidden flex">

          {/* Left: list */}
          <div className="w-72 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">
                {departments.length} departamento{departments.length !== 1 ? 's' : ''}
              </h2>
            </div>

            {showCreate && (
              <form onSubmit={handleCreate} className="p-4 border-b border-gray-100 bg-gray-50">
                <div className="mb-2">
                  <input
                    className="input text-sm"
                    placeholder="Nome do departamento"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required autoFocus
                  />
                </div>
                <div className="mb-2">
                  <input
                    className="input text-sm"
                    placeholder="Descrição (opcional)"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                <div className="flex gap-1 mb-3 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c} type="button"
                      onClick={() => setNewColor(c)}
                      className={clsx('w-6 h-6 rounded-full transition-transform', newColor === c && 'scale-125 ring-2 ring-offset-1 ring-gray-400')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1 text-xs" disabled={creating}>
                    {creating ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Criar
                  </button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setShowCreate(false)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader className="w-5 h-5 animate-spin text-gray-300" />
                </div>
              ) : departments.length === 0 ? (
                <div className="text-center py-10 px-4 text-sm text-gray-400">
                  Nenhum departamento.<br />Crie o primeiro!
                </div>
              ) : (
                departments.map((dept) => (
                  <div
                    key={dept.id}
                    onClick={() => selectDept(dept)}
                    className={clsx(
                      'group flex items-start gap-3 p-4 cursor-pointer border-b border-gray-50 transition-colors',
                      selectedDept?.id === dept.id ? 'bg-brand-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: dept.color }} />
                    <div className="flex-1 min-w-0">
                      {editingId === dept.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); handleRename(dept.id); }} onClick={(e) => e.stopPropagation()}>
                          <input
                            className="input text-sm py-1"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                            onBlur={() => setEditingId(null)}
                          />
                        </form>
                      ) : (
                        <div className="font-semibold text-gray-900 text-sm truncate">{dept.name}</div>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{dept.agent_count}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{dept.conversation_count}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingId(dept.id); setEditName(dept.name); }}
                          className="p-1 text-gray-300 hover:text-gray-600 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(dept.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
            {!selectedDept ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <Users className="w-12 h-12 mb-3 text-gray-200" />
                <p className="text-sm">Selecione um departamento para gerenciar seus agentes</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedDept.color }} />
                  <h2 className="text-xl font-bold text-gray-900">{selectedDept.name}</h2>
                  {selectedDept.description && (
                    <span className="text-sm text-gray-400">{selectedDept.description}</span>
                  )}
                </div>

                <div className="card p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    IA ({agentName}) — persona deste departamento
                  </h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Esse texto é somado à persona padrão de {agentName} para conversas deste departamento.
                  </p>
                  <textarea
                    className="input text-sm min-h-[140px] resize-y"
                    rows={6}
                    value={aiPersonaDraft}
                    onChange={(e) => setAiPersonaDraft(e.target.value)}
                    placeholder="Ex: Foque em imóveis para locação residencial. Seja informal e use emojis com moderação."
                  />
                  <div className="flex items-center gap-3 mt-2">
                    <button type="button" className="btn-primary text-xs" onClick={handleSavePersona} disabled={savingPersona}>
                      {savingPersona ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {personaSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                  </div>
                </div>

                <div className="card p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    IA ({agentName}) — quando transferir para este departamento
                  </h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Descreva os assuntos que devem ser direcionados aqui. {agentName} usa esse texto para transferir automaticamente.
                  </p>
                  <textarea
                    className="input text-sm min-h-[100px] resize-y"
                    rows={4}
                    value={routingDraft}
                    onChange={(e) => setRoutingDraft(e.target.value)}
                    placeholder="Ex: Dúvidas sobre pagamento de boleto, segunda via, inadimplência, distrato e questões financeiras."
                  />
                  <div className="flex items-center gap-3 mt-2">
                    <button type="button" className="btn-primary text-xs" onClick={handleSaveRouting} disabled={savingRouting}>
                      {savingRouting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {routingSaved ? 'Salvo!' : 'Salvar'}
                    </button>
                  </div>
                </div>

                <div className="card overflow-hidden mb-6">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white">
                    <h3 className="font-semibold text-gray-900 text-sm">Agentes ({deptAgents.length})</h3>
                  </div>
                  {loadingAgents ? (
                    <div className="flex items-center justify-center py-8"><Loader className="w-5 h-5 animate-spin text-gray-300" /></div>
                  ) : deptAgents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-400 text-center">Nenhum agente neste departamento</div>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {deptAgents.map((agent) => (
                          <tr key={agent.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-bold flex-shrink-0">
                                  {agent.name[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900">{agent.name}</div>
                                  <div className="text-xs text-gray-400">{agent.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="badge-gray">{agent.open_conversations ?? 0} conversa{agent.open_conversations !== 1 ? 's' : ''} abertas</span>
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => handleRemoveAgent(agent.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Remover do departamento">
                                  <UserMinus className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {isAdmin && unassigned.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 bg-white">
                      <h3 className="font-semibold text-gray-900 text-sm">Agentes sem departamento ({unassigned.length})</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Clique para adicionar a este departamento</p>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {unassigned.map((agent) => (
                          <tr key={agent.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold flex-shrink-0">
                                  {agent.name[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-700">{agent.name}</div>
                                  <div className="text-xs text-gray-400">{agent.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleAssign(agent.id)} className="btn-secondary text-xs py-1.5 px-2.5 gap-1">
                                <UserPlus className="w-3.5 h-3.5" /> Adicionar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Overview tab ────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loadingOverview ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-4 h-56 animate-pulse" />
              ))}
            </div>
          ) : overview.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Gauge className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Nenhum departamento cadastrado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {overview.map(dept => (
                <div key={dept.id} className="card p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dept.color }} />
                      <h3 className="font-bold text-gray-900 text-sm truncate">{dept.name}</h3>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                      <Users className="w-3.5 h-3.5" />{dept.agent_count}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                        <MessageSquare className="w-3.5 h-3.5" /> Conversas abertas
                      </div>
                      <div className="text-xl font-bold text-gray-900">{dept.open_conversations}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                        <Briefcase className="w-3.5 h-3.5" /> Deals ativos
                      </div>
                      <div className="text-xl font-bold text-gray-900">{dept.active_deals}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                        <Wallet className="w-3.5 h-3.5" /> Valor em funil
                      </div>
                      <div className="text-sm font-bold text-gray-900">{currencyFmt.format(dept.pipeline_value)}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5">
                        <Clock className="w-3.5 h-3.5" /> Tempo médio
                      </div>
                      <div className="text-sm font-bold text-gray-900">{formatAvgResponse(dept.avg_response_seconds)}</div>
                    </div>
                  </div>

                  {dept.deals_by_stage.length > 0 && (
                    <div className="space-y-1 mb-3 flex-1">
                      {dept.deals_by_stage.map(s => (
                        <div key={s.stage_name} className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.stage_color }} />
                          <span className="text-gray-600 truncate flex-1">{s.stage_name}</span>
                          <span className="font-semibold text-gray-900">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-auto">
                    <button onClick={() => router.push('/dashboard/conversations')} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                      Conversas <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => router.push('/dashboard/kanban')} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                      Funil <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
