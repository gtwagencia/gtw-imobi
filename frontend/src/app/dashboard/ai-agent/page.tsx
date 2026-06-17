'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  Bot, Users, Plus, Trash2, Edit2, Check, X, ChevronDown,
  Loader2, UserPlus, Sparkles, ArrowRight, Zap, Building2,
  Home, Briefcase, Layers, Coffee, Save,
} from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/store/toast';

type Tab = 'grupos' | 'persona' | 'fluxo';

interface RoutingGroup {
  id: string;
  name: string;
  description: string | null;
  group_type: string;
  routing_mode: string;
  is_active: boolean;
  member_count: number;
}

interface GroupMember {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  membership_id: string;
  is_active: boolean;
}

interface WorkspaceMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

const GROUP_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  compra_venda:   { label: 'Compra e Venda',    icon: Home,      color: 'text-brand-600',  bg: 'bg-brand-50'  },
  aluguel:        { label: 'Locação',            icon: Briefcase, color: 'text-blue-600',   bg: 'bg-blue-50'   },
  empreendimento: { label: 'Empreendimentos',   icon: Building2, color: 'text-amber-600',  bg: 'bg-amber-50'  },
  investimento:   { label: 'Investidores',       icon: Layers,    color: 'text-violet-600', bg: 'bg-violet-50' },
  plantao:        { label: 'Plantão Geral',      icon: Coffee,    color: 'text-emerald-600',bg: 'bg-emerald-50'},
  geral:          { label: 'Geral',              icon: Users,     color: 'text-gray-600',   bg: 'bg-gray-50'   },
};

const ROUTING_MODE_LABELS: Record<string, string> = {
  round_robin: 'Round-robin (sequencial)',
  manual:      'Manual (sem auto-atribuição)',
};

export default function AiAgentPage() {
  const { currentWorkspace, currentOrg } = useAuth();
  const showToast = useToast(s => s.show);

  const [tab, setTab] = useState<Tab>('grupos');
  const [groups, setGroups] = useState<RoutingGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Grupo selecionado
  const [selectedGroup, setSelectedGroup]  = useState<string | null>(null);
  const [groupMembers, setGroupMembers]    = useState<GroupMember[]>([]);
  const [wsMembers,    setWsMembers]       = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Modal de grupo
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup,   setEditingGroup]   = useState<RoutingGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', group_type: 'geral', routing_mode: 'round_robin' });
  const [savingGroup, setSavingGroup] = useState(false);

  // Persona (workspace)
  const [personaForm, setPersonaForm] = useState({ ai_agent_name: '', ai_tools_enabled: false });
  const [savingPersona, setSavingPersona] = useState(false);

  const wsId = currentWorkspace?.id;
  const orgId = currentOrg?.id;

  const loadGroups = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${wsId}/ai-agent/groups`);
      setGroups(data);
    } finally { setLoading(false); }
  }, [wsId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (currentWorkspace) {
      setPersonaForm({
        ai_agent_name:   (currentWorkspace as Record<string, unknown>).ai_agent_name as string || 'Lia',
        ai_tools_enabled: Boolean((currentWorkspace as Record<string, unknown>).ai_tools_enabled),
      });
    }
  }, [currentWorkspace]);

  async function loadGroupDetail(groupId: string) {
    if (!wsId || !orgId) return;
    setSelectedGroup(groupId);
    setLoadingMembers(true);
    try {
      const [{ data: detail }, { data: wsMembersData }] = await Promise.all([
        api.get(`/workspaces/${wsId}/ai-agent/groups/${groupId}`),
        api.get(`/orgs/${orgId}/workspaces/${wsId}/members`),
      ]);
      setGroupMembers(detail.members || []);
      setWsMembers(wsMembersData || []);
    } finally { setLoadingMembers(false); }
  }

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupForm({ name: '', description: '', group_type: 'geral', routing_mode: 'round_robin' });
    setShowGroupModal(true);
  }

  function openEditGroup(g: RoutingGroup) {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description || '', group_type: g.group_type, routing_mode: g.routing_mode });
    setShowGroupModal(true);
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await api.put(`/workspaces/${wsId}/ai-agent/groups/${editingGroup.id}`, {
          name: groupForm.name, description: groupForm.description,
          groupType: groupForm.group_type, routingMode: groupForm.routing_mode,
        });
        showToast('Grupo atualizado');
      } else {
        await api.post(`/workspaces/${wsId}/ai-agent/groups`, {
          name: groupForm.name, description: groupForm.description,
          groupType: groupForm.group_type, routingMode: groupForm.routing_mode,
        });
        showToast('Grupo criado');
      }
      setShowGroupModal(false);
      await loadGroups();
    } catch { showToast('Erro ao salvar grupo', 'error'); }
    finally { setSavingGroup(false); }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!wsId || !confirm('Excluir este grupo de atendimento?')) return;
    await api.delete(`/workspaces/${wsId}/ai-agent/groups/${groupId}`);
    if (selectedGroup === groupId) { setSelectedGroup(null); setGroupMembers([]); }
    await loadGroups();
    showToast('Grupo excluído');
  }

  async function handleAddMember(userId: string) {
    if (!wsId || !selectedGroup) return;
    await api.post(`/workspaces/${wsId}/ai-agent/groups/${selectedGroup}/members`, { userId });
    await loadGroupDetail(selectedGroup);
    await loadGroups();
    showToast('Corretor adicionado ao grupo');
  }

  async function handleRemoveMember(userId: string) {
    if (!wsId || !selectedGroup) return;
    await api.delete(`/workspaces/${wsId}/ai-agent/groups/${selectedGroup}/members/${userId}`);
    await loadGroupDetail(selectedGroup);
    await loadGroups();
    showToast('Corretor removido do grupo');
  }

  async function handleSavePersona(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId || !orgId) return;
    setSavingPersona(true);
    try {
      await api.put(`/orgs/${orgId}/workspaces/${wsId}`, {
        aiAgentName:    personaForm.ai_agent_name,
        aiToolsEnabled: personaForm.ai_tools_enabled,
      });
      showToast('Configurações salvas');
    } catch { showToast('Erro ao salvar', 'error'); }
    finally { setSavingPersona(false); }
  }

  const activeMembers = groupMembers.filter(m => m.is_active);
  const notInGroup = wsMembers.filter(m => !activeMembers.find(gm => gm.id === m.user_id));

  return (
    <>
      <Header title="Agente IA" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-6xl">

        {/* Hero */}
        <div className="card p-5 mb-6 bg-gradient-to-br from-brand-50 to-violet-50 border-brand-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow flex-shrink-0">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-bold text-gray-900">Agente IA de Atendimento</h2>
                <span className="badge-blue text-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Inteligência Artificial
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Configure a persona, os grupos de atendimento e o fluxo de roteamento automático de leads.
                A IA qualifica, busca imóveis e direciona cada lead para o especialista certo — 24h por dia.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 gap-1">
          {([
            { key: 'grupos',  label: 'Grupos de Atendimento', icon: Users   },
            { key: 'persona', label: 'Persona',               icon: Bot     },
            { key: 'fluxo',   label: 'Fluxo de Roteamento',  icon: Zap     },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ── Tab: Grupos ───────────────────────────────────────────────────── */}
        {tab === 'grupos' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Lista de grupos */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Grupos configurados</h3>
                <button onClick={openCreateGroup} className="btn-primary btn-sm">
                  <Plus className="w-3.5 h-3.5" /> Novo grupo
                </button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}
                </div>
              ) : groups.length === 0 ? (
                <div className="card p-6 text-center">
                  <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Nenhum grupo criado ainda</p>
                  <button onClick={openCreateGroup} className="btn-secondary btn-sm mt-3">
                    <Plus className="w-3.5 h-3.5" /> Criar primeiro grupo
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map(g => {
                    const cfg = GROUP_TYPE_CONFIG[g.group_type] || GROUP_TYPE_CONFIG.geral;
                    const Icon = cfg.icon;
                    const isSelected = selectedGroup === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => loadGroupDetail(g.id)}
                        className={clsx(
                          'w-full text-left card p-3.5 transition-all hover:shadow-soft',
                          isSelected ? 'border-brand-400 bg-brand-50/50 shadow-soft' : ''
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', cfg.bg)}>
                            <Icon className={clsx('w-4 h-4', cfg.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-900 truncate">{g.name}</div>
                            <div className="text-xs text-gray-400">{cfg.label} · {g.member_count} {g.member_count === 1 ? 'corretor' : 'corretores'}</div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); openEditGroup(g); }}
                              className="p-1 text-gray-300 hover:text-brand-500 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Detalhe do grupo selecionado */}
            <div className="lg:col-span-3">
              {!selectedGroup ? (
                <div className="card p-8 text-center h-full flex flex-col items-center justify-center">
                  <Users className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400 font-medium">Selecione um grupo para gerenciar os corretores</p>
                  <p className="text-xs text-gray-300 mt-1">A IA usa os grupos para rotear leads automaticamente para o especialista certo</p>
                </div>
              ) : loadingMembers ? (
                <div className="card p-8 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : (
                <div className="card overflow-hidden">
                  {(() => {
                    const g = groups.find(x => x.id === selectedGroup);
                    const cfg = g ? (GROUP_TYPE_CONFIG[g.group_type] || GROUP_TYPE_CONFIG.geral) : GROUP_TYPE_CONFIG.geral;
                    return (
                      <>
                        {/* Header do grupo */}
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                          <div className="flex items-center gap-3">
                            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', cfg.bg)}>
                              <cfg.icon className={clsx('w-4 h-4', cfg.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-gray-900">{g?.name}</div>
                              <div className="text-xs text-gray-400">{ROUTING_MODE_LABELS[g?.routing_mode || 'round_robin']}</div>
                            </div>
                          </div>
                          {g?.description && (
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{g.description}</p>
                          )}
                        </div>

                        {/* Corretores no grupo */}
                        <div className="p-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Corretores no grupo</h4>
                          {activeMembers.length === 0 ? (
                            <p className="text-xs text-gray-400 italic mb-3">Nenhum corretor adicionado ainda</p>
                          ) : (
                            <div className="space-y-2 mb-4">
                              {activeMembers.map(m => (
                                <div key={m.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 group">
                                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                                    {m.name[0]?.toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">{m.name}</div>
                                    <div className="text-xs text-gray-400 truncate">{m.email}</div>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveMember(m.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Adicionar corretor */}
                          {notInGroup.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Adicionar ao grupo</h4>
                              <div className="space-y-1">
                                {notInGroup.map(m => (
                                  <button
                                    key={m.user_id}
                                    onClick={() => handleAddMember(m.user_id)}
                                    className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-brand-50 transition-colors text-left"
                                  >
                                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                                      {m.name[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-700 truncate">{m.name}</div>
                                    </div>
                                    <UserPlus className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Persona ─────────────────────────────────────────────────── */}
        {tab === 'persona' && (
          <div className="max-w-xl">
            <form onSubmit={handleSavePersona} className="card p-6 space-y-5">
              <div>
                <label className="label">Nome da consultora virtual</label>
                <input
                  className="input"
                  placeholder="Lia"
                  value={personaForm.ai_agent_name}
                  onChange={e => setPersonaForm(f => ({ ...f, ai_agent_name: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">
                  O nome que a IA usa para se apresentar aos clientes. Ex: Lia, Sofia, Ana.
                </p>
              </div>

              <div>
                <label className="label">Ferramentas inteligentes</label>
                <button
                  type="button"
                  onClick={() => setPersonaForm(f => ({ ...f, ai_tools_enabled: !f.ai_tools_enabled }))}
                  className={clsx(
                    'flex items-center gap-3 w-full p-3.5 rounded-xl border-2 transition-all text-left',
                    personaForm.ai_tools_enabled
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  )}
                >
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    personaForm.ai_tools_enabled ? 'bg-brand-600' : 'bg-gray-200'
                  )}>
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900">
                      {personaForm.ai_tools_enabled ? 'Ativo — modo agente com ferramentas' : 'Inativo — modo chatbot simples'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Quando ativo, a IA busca imóveis, envia fichas, propõe visitas e roteia leads automaticamente
                    </div>
                  </div>
                  {personaForm.ai_tools_enabled && <Check className="w-4 h-4 text-brand-600 ml-auto" />}
                </button>
              </div>

              <div className="pt-2">
                <button type="submit" className="btn-primary" disabled={savingPersona}>
                  {savingPersona ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar configurações
                </button>
              </div>
            </form>

            {/* Preview do prompt */}
            <div className="mt-5 card p-5">
              <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-500" />
                O que a {personaForm.ai_agent_name || 'Lia'} já sabe fazer
              </h3>
              <div className="space-y-2.5">
                {[
                  { icon: '🎵', text: 'Entende áudios transcritos e responde ao conteúdo falado' },
                  { icon: '📷', text: 'Analisa fotos de imóveis, plantas baixas e comprovantes' },
                  { icon: '📄', text: 'Lê documentos PDF (contratos, propostas, comprovantes de renda)' },
                  { icon: '🔗', text: 'Reconhece links e pergunta o que o cliente achou' },
                  { icon: '🤝', text: 'Qualifica leads com perguntas naturais, sem parecer formulário' },
                  { icon: '🏠', text: 'Busca imóveis e empreendimentos no catálogo automaticamente' },
                  { icon: '📅', text: 'Propõe visitas e notifica a equipe' },
                  { icon: '↪️', text: 'Roteia para o corretor especialista certo via grupos de atendimento' },
                  { icon: '🌙', text: 'Atende 24h — fora do horário comercial mantém o lead engajado' },
                  { icon: '💬', text: 'Lida com objeções como "tá caro", "vou pensar", "já tenho corretor"' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-base leading-5 flex-shrink-0">{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Fluxo ───────────────────────────────────────────────────── */}
        {tab === 'fluxo' && (
          <div className="max-w-3xl">
            <p className="text-sm text-gray-500 mb-6">
              Visualize como a IA processa cada lead e decide para onde rotear.
            </p>

            <div className="space-y-3">
              {[
                {
                  step: '1',
                  title: 'Lead entra em contato',
                  desc: 'Cliente manda mensagem pelo WhatsApp, Instagram, site ou qualquer canal conectado',
                  color: 'bg-blue-500',
                },
                {
                  step: '2',
                  title: 'Lia recebe e processa',
                  desc: 'Analisa texto, áudio, imagem, PDF ou link. Identifica contexto e estado emocional do cliente',
                  color: 'bg-violet-500',
                },
                {
                  step: '3',
                  title: 'Qualifica com conversa natural',
                  desc: 'Descobre intenção (comprar/alugar/investir), localização, orçamento e urgência de forma orgânica',
                  color: 'bg-brand-500',
                },
                {
                  step: '4a',
                  title: 'Busca imóveis / empreendimentos',
                  desc: 'Quando tem critérios suficientes, usa ferramentas para buscar e enviar fichas diretamente no chat',
                  color: 'bg-emerald-500',
                },
                {
                  step: '4b',
                  title: 'Propõe visita',
                  desc: 'Quando o cliente demonstrou interesse real, propõe data e hora. A equipe confirma.',
                  color: 'bg-orange-500',
                },
                {
                  step: '5',
                  title: 'Roteia para o especialista certo',
                  desc: `Identifica o grupo (${groups.filter(g => g.is_active).map(g => g.name).join(', ') || 'Compra e Venda, Locação, Empreendimentos...'}) e atribui via round-robin ao próximo corretor disponível`,
                  color: 'bg-amber-500',
                },
                {
                  step: '6',
                  title: 'Corretor assume com contexto completo',
                  desc: 'O corretor recebe a conversa já qualificada com resumo do perfil do cliente. Zero retrabalho.',
                  color: 'bg-gray-500',
                },
              ].map((s, i, arr) => (
                <div key={s.step}>
                  <div className="flex items-start gap-4">
                    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5', s.color)}>
                      {s.step}
                    </div>
                    <div className="flex-1 card p-4">
                      <div className="font-semibold text-gray-900 text-sm mb-0.5">{s.title}</div>
                      <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="ml-4 pl-0 py-0.5 flex">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 rotate-90 ml-2" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de grupo ──────────────────────────────────────────────────── */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingGroup ? 'Editar grupo' : 'Novo grupo de atendimento'}</h2>
              <button onClick={() => setShowGroupModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveGroup} className="p-5 space-y-4">
              <div>
                <label className="label">Nome do grupo <span className="text-red-500">*</span></label>
                <input className="input" placeholder="Ex: Vendas Zona Sul" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              <div>
                <label className="label">Tipo de atendimento</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(GROUP_TYPE_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setGroupForm(f => ({ ...f, group_type: key }))}
                        className={clsx(
                          'flex items-center gap-2 p-2.5 rounded-xl border-2 text-left text-sm transition-all',
                          groupForm.group_type === key ? `border-brand-400 ${cfg.bg}` : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <Icon className={clsx('w-4 h-4 flex-shrink-0', cfg.color)} />
                        <span className="font-medium text-gray-700 text-xs">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="label">Modo de roteamento</label>
                <select className="input" value={groupForm.routing_mode} onChange={e => setGroupForm(f => ({ ...f, routing_mode: e.target.value }))}>
                  <option value="round_robin">Round-robin (sequencial)</option>
                  <option value="manual">Manual (sem auto-atribuição)</option>
                </select>
              </div>

              <div>
                <label className="label">Descrição para a IA</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Descreva quando a IA deve rotear para este grupo. Ex: 'Ativar quando o cliente quer alugar imóvel residencial'"
                  value={groupForm.description}
                  onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">A IA usa isso para decidir qual grupo ativar.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowGroupModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary" disabled={savingGroup}>
                  {savingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingGroup ? 'Salvar' : 'Criar grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
