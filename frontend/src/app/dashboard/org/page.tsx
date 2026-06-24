'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  Users, Building2, Plus, Trash2, Shield,
  Crown, User, Mail, Check, X, Loader,
  Home, Construction, ChevronRight, ChevronLeft,
  LayoutList, Kanban, ShieldCheck, Sparkles, Bot,
} from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/store/toast';

type Tab = 'members' | 'workspaces';

interface Member {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

type BusinessModel = 'imobiliaria' | 'construtora';
type WizardStep = 'type' | 'name';

const ROLE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  owner:  { label: 'Owner',  icon: Crown,  color: 'text-yellow-600' },
  admin:  { label: 'Admin',  icon: Shield, color: 'text-blue-600' },
  member: { label: 'Membro', icon: User,   color: 'text-gray-500' },
};

// ── Templates por tipo de negócio ─────────────────────────────────────────

const TEMPLATES: Record<BusinessModel, {
  label: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  border: string;
  departments: { name: string; color: string }[];
  pipeline: string[];
  automations: string[];
}> = {
  imobiliaria: {
    label:    'Imobiliária',
    subtitle: 'Imóveis de terceiros, compra, venda e locação',
    icon:     Home,
    color:    'text-brand-600',
    border:   'border-brand-400 bg-brand-50',
    departments: [
      { name: 'Vendas',         color: '#22c55e' },
      { name: 'Locação',        color: '#3b82f6' },
      { name: 'Pós-venda',      color: '#f97316' },
      { name: 'Administrativo', color: '#6366f1' },
    ],
    pipeline: ['Novo Lead', 'Em Atendimento', 'Qualificado', 'Comprou', 'Perdido'],
    automations: [
      'Resposta automática fora do horário comercial',
      'Qualificação de leads com IA',
      'Follow-up automático para leads frios',
      'Alerta de SLA vencido para supervisores',
      'Roteamento por departamento via IA',
    ],
  },
  construtora: {
    label:    'Incorporadora / Construtora',
    subtitle: 'Empreendimentos próprios, lançamentos e pós-obra',
    icon:     Construction,
    color:    'text-amber-600',
    border:   'border-amber-400 bg-amber-50',
    departments: [
      { name: 'Comercial',          color: '#22c55e' },
      { name: 'Relacionamento',     color: '#3b82f6' },
      { name: 'Financeiro',         color: '#eab308' },
      { name: 'Obras e Engenharia', color: '#f97316' },
      { name: 'Jurídico',           color: '#6366f1' },
    ],
    pipeline: ['Novo Lead', 'Em Atendimento', 'Qualificado', 'Reservado', 'Contrato', 'Perdido'],
    automations: [
      'Resposta automática fora do horário comercial',
      'Qualificação de leads com IA por produto',
      'Notificação automática de andamento de obra',
      'Follow-up para leads de stands e eventos',
      'Roteamento por departamento via IA',
    ],
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export default function OrgPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentOrg, currentWorkspace, user } = useAuth();

  const isPlatformAdmin = user?.is_super_admin || currentOrg?.role === 'owner' || currentOrg?.role === 'admin';
  useEffect(() => {
    if (user && !isPlatformAdmin) router.replace('/dashboard');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isPlatformAdmin]);
  const { workspaces, fetchForOrg } = useWorkspaceStore();
  const showToast = useToast((s) => s.show);

  const [tab,          setTab]          = useState<Tab>((searchParams.get('tab') as Tab) || 'members');
  const [members,      setMembers]      = useState<Member[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Invite
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole,  setInviteRole]    = useState('member');
  const [inviting,    setInviting]      = useState(false);
  const [inviteError, setInviteError]   = useState('');

  // New org modal (super admin only)
  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [newOrgName,      setNewOrgName]      = useState('');
  const [creatingOrg,     setCreatingOrg]     = useState(false);

  // Workspace wizard
  const [showWizard,    setShowWizard]    = useState(false);
  const [wizardStep,    setWizardStep]    = useState<WizardStep>('type');
  const [wsBusinessModel, setWsBusinessModel] = useState<BusinessModel>('imobiliaria');
  const [wsName,          setWsName]          = useState('');
  const [wsSeedDemo,      setWsSeedDemo]      = useState(false);
  const [creatingWs,      setCreatingWs]      = useState(false);

  const isSuperAdmin = user?.is_super_admin === true;
  const canManage = isSuperAdmin || currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  if (currentOrg && !canManage) {
    return (
      <>
        <Header title="Organização" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <Shield className="w-10 h-10 text-gray-300" />
          <p className="text-gray-500 text-sm">Você não tem permissão para acessar esta página.</p>
        </div>
      </>
    );
  }

  const loadMembers = useCallback(async () => {
    if (!currentOrg || !canManage) return;
    setLoading(true);
    try {
      // Lê currentWorkspace via getState() para não entrar nas deps e evitar
      // loop com o fetchForOrg que sincroniza o workspace store.
      const wsId = useAuth.getState().currentWorkspace?.id;
      const params = wsId ? `?workspaceId=${wsId}` : '';
      const { data } = await api.get(`/orgs/${currentOrg.id}/members${params}`);
      setMembers(data);
    } finally { setLoading(false); }
  }, [currentOrg, canManage]);

  useEffect(() => {
    loadMembers();
    if (currentOrg) fetchForOrg(currentOrg.id);
  }, [loadMembers, currentOrg, fetchForOrg]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setInviteError(''); setInviting(true);
    try {
      await api.post(`/orgs/${currentOrg.id}/members`, { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      loadMembers();
      showToast(`Convite enviado para ${inviteEmail}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao convidar';
      setInviteError(msg);
      showToast(msg, 'error');
    } finally { setInviting(false); }
  }

  async function handleRemoveMember(userId: string) {
    if (!currentOrg || !confirm('Remover este membro?')) return;
    await api.delete(`/orgs/${currentOrg.id}/members/${userId}`);
    loadMembers();
    showToast('Membro removido');
  }

  async function handleRoleChange(userId: string, role: string) {
    if (!currentOrg) return;
    await api.put(`/orgs/${currentOrg.id}/members/${userId}/role`, { role });
    loadMembers();
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreatingOrg(true);
    try {
      await api.post('/orgs', { name: newOrgName.trim() });
      setNewOrgName('');
      setShowNewOrgModal(false);
      showToast(`Organização "${newOrgName}" criada com sucesso!`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao criar organização';
      showToast(msg, 'error');
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setCreatingWs(true);
    try {
      await api.post(`/orgs/${currentOrg.id}/workspaces`, { name: wsName, businessModel: wsBusinessModel, seedDemo: wsSeedDemo });
      setWsName(''); setWsBusinessModel('imobiliaria'); setWsSeedDemo(false);
      setShowWizard(false); setWizardStep('type');
      fetchForOrg(currentOrg.id);
      showToast(`Workspace "${wsName}" criado com sucesso!`);
    } catch {
      showToast('Erro ao criar workspace', 'error');
    } finally {
      setCreatingWs(false);
    }
  }

  function openWizard() { setShowWizard(true); setWizardStep('type'); setWsName(''); setWsSeedDemo(false); }
  function closeWizard() { setShowWizard(false); setWizardStep('type'); }

  if (!currentOrg) return null;

  const tmpl = TEMPLATES[wsBusinessModel];

  return (
    <>
      <Header
        title="Organização"
        actions={isSuperAdmin ? (
          <button className="btn-primary text-sm" onClick={() => setShowNewOrgModal(true)}>
            <Plus className="w-4 h-4" /> Nova organização
          </button>
        ) : undefined}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Org info */}
        <div className="card p-5 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900">{currentOrg.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge-blue text-xs">{currentOrg.plan}</span>
              <span className="text-xs text-gray-400">Seu papel: <strong>{currentOrg.role}</strong></span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {[
            { key: 'members',    label: 'Membros',    icon: Users },
            { key: 'workspaces', label: 'Workspaces', icon: Building2 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
                tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ── Tab: Membros ─────────────────────────────────────── */}
        {tab === 'members' && (
          <div>
            {canManage && (
              <form onSubmit={handleInvite} className="card p-4 mb-5">
                <h3 className="font-semibold text-gray-900 mb-3">Convidar membro</h3>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input className="input pl-9" type="email" placeholder="email@exemplo.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
                  </div>
                  <select className="input w-32" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="member">Membro</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button type="submit" className="btn-primary" disabled={inviting}>
                    {inviting ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Convidar
                  </button>
                </div>
                {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
                <p className="text-xs text-gray-400 mt-2">Se o usuário ainda não tiver conta, um e-mail de convite será enviado automaticamente.</p>
              </form>
            )}

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Membro</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Papel</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3"><div className="h-4 w-48 bg-gray-100 animate-pulse rounded" /></td>
                          <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-100 animate-pulse rounded" /></td>
                        </tr>
                      ))
                    : members.map((m) => {
                        const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS.member;
                        const RoleIcon = roleInfo.icon;
                        return (
                          <tr key={m.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-bold flex-shrink-0">
                                  {m.name[0]?.toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900">{m.name}</div>
                                  <div className="text-xs text-gray-400">{m.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {canManage ? (
                                <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value)} className={clsx('text-sm font-semibold bg-transparent border-none outline-none cursor-pointer', roleInfo.color)}>
                                  <option value="member">Membro</option>
                                  <option value="admin">Admin</option>
                                  <option value="owner">Owner</option>
                                </select>
                              ) : (
                                <span className={clsx('flex items-center gap-1.5 text-sm font-semibold', roleInfo.color)}>
                                  <RoleIcon className="w-3.5 h-3.5" />{roleInfo.label}
                                </span>
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-right">
                                {m.role !== 'owner' && (
                                  <button onClick={() => handleRemoveMember(m.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Remover">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Workspaces ──────────────────────────────────── */}
        {tab === 'workspaces' && (
          <div>
            {canManage && (
              <div className="mb-5">
                <button className="btn-primary" onClick={openWizard}>
                  <Plus className="w-4 h-4" /> Novo workspace
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspaces.map((ws) => (
                <div key={ws.id} className="card p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg flex-shrink-0">
                      {ws.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900">{ws.name}</div>
                      <div className="text-xs text-gray-400">
                        {ws.business_model === 'construtora' ? 'Incorporadora / Construtora' : 'Imobiliária'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>{ws.inbox_count ?? 0} inboxes</span>
                    <span>{ws.member_count ?? 0} membros</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Nova organização modal (super admin) ──────────────────────── */}
      {showNewOrgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-900">Nova organização</h2>
              <button onClick={() => setShowNewOrgModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateOrg} className="p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome da organização</label>
              <input
                className="input mb-4"
                placeholder="Ex: Imobiliária Silva"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setShowNewOrgModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={creatingOrg || !newOrgName.trim()}>
                  {creatingOrg ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Criar organização
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Wizard modal ────────────────────────────────────────────────── */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-xl text-gray-900">Criar workspace</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {wizardStep === 'type' ? 'Passo 1 de 2 — Tipo do negócio' : 'Passo 2 de 2 — Nome e confirmação'}
                </p>
              </div>
              <button onClick={closeWizard} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Choose type */}
            {wizardStep === 'type' && (
              <div className="p-6">
                <h3 className="font-bold text-gray-900 mb-1">Qual é o tipo do negócio?</h3>
                <p className="text-sm text-gray-500 mb-5">
                  Isso define os departamentos, pipeline e automações criados automaticamente.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {(Object.entries(TEMPLATES) as [BusinessModel, typeof TEMPLATES[BusinessModel]][]).map(([key, tmpl]) => {
                    const Icon = tmpl.icon;
                    const selected = wsBusinessModel === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWsBusinessModel(key)}
                        className={clsx(
                          'text-left border-2 rounded-2xl p-5 transition-all',
                          selected ? tmpl.border + ' shadow-soft' : 'border-gray-200 hover:border-gray-300 bg-white',
                        )}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', selected ? 'bg-white shadow-soft' : 'bg-gray-100')}>
                            <Icon className={clsx('w-5 h-5', selected ? tmpl.color : 'text-gray-500')} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-sm">{tmpl.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{tmpl.subtitle}</div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Departamentos criados</p>
                          <div className="flex flex-wrap gap-1.5">
                            {tmpl.departments.map(d => (
                              <span key={d.name} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-700">
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                {d.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        {selected && (
                          <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                            <Check className="w-3.5 h-3.5" /> Selecionado
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <button className="btn-primary" onClick={() => setWizardStep('name')}>
                    Próximo <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Name + preview */}
            {wizardStep === 'name' && (
              <form onSubmit={handleCreateWorkspace} className="p-6">
                <h3 className="font-bold text-gray-900 mb-1">Nome do workspace</h3>
                <p className="text-sm text-gray-500 mb-4">Use o nome da imobiliária/construtora ou do cliente.</p>

                <input
                  className="input mb-6 text-base font-semibold"
                  placeholder={tmpl.label === 'Imobiliária' ? 'Ex: Imobiliária Silva' : 'Ex: Construtora Horizonte'}
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  required
                  autoFocus
                />

                {/* Toggle dados demo */}
                <button
                  type="button"
                  onClick={() => setWsSeedDemo(v => !v)}
                  className={clsx(
                    'w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all mb-4',
                    wsSeedDemo
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:border-gray-300',
                  )}
                >
                  <div className={clsx(
                    'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors',
                    wsSeedDemo ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300',
                  )}>
                    {wsSeedDemo && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Preencher com dados de demonstração
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {wsBusinessModel === 'construtora'
                        ? 'Cria 3 empreendimentos com unidades, 15 contatos e 10 leads no funil — ideal para testar todas as funcionalidades.'
                        : 'Cria 12 imóveis, 15 contatos e 10 leads distribuídos no funil — ideal para testar todas as funcionalidades.'}
                    </p>
                  </div>
                </button>

                {/* Template preview */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">O que será criado automaticamente</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <LayoutList className="w-3.5 h-3.5 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700">{tmpl.departments.length} Departamentos</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tmpl.departments.map(d => d.name).join(', ')}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Kanban className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700">Funil com {tmpl.pipeline.length} etapas</p>
                        <p className="text-xs text-gray-500 mt-0.5">{tmpl.pipeline.join(' → ')}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-violet-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700">Perfis de permissão</p>
                        <p className="text-xs text-gray-500 mt-0.5">Admin, Agente, Tickets only</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700">Agente IA configurado</p>
                        <p className="text-xs text-gray-500 mt-0.5">Roteamento e qualificação ativos</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-bold text-gray-500 mb-2">Automações sugeridas</p>
                    <div className="space-y-1">
                      {tmpl.automations.map((a) => (
                        <div key={a} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          {a}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setWizardStep('type')}
                    className="btn-secondary gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" /> Voltar
                  </button>
                  <button type="submit" className="btn-primary" disabled={creatingWs || !wsName.trim()}>
                    {creatingWs ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Criar workspace
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
