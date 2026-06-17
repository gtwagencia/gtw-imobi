'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  Plus, Trash2, Pencil, X, Check, Loader2, Building2, Phone,
  Mail, Search, ChevronDown, ChevronRight, UserPlus, User,
  Link2, Copy, ExternalLink, Shield, ShieldOff, Users,
} from 'lucide-react';
import { useToast } from '@/store/toast';
import clsx from 'clsx';

interface Agency {
  id: string; name: string; cnpj: string | null; creci: string | null;
  phone: string | null; email: string | null; city: string | null; state: string | null;
  address: string | null; notes: string | null; active: boolean;
  users_count: number; created_at: string;
}

interface AgencyUser {
  id: string; agency_id: string; name: string; role: string;
  email: string | null; phone: string | null; creci: string | null;
  portal_token: string | null; portal_active: boolean;
  portal_developments: string[];
  notes: string | null;
}

const ROLE_OPTIONS = ['corretor', 'auxiliar administrativo', 'gerente comercial', 'diretor', 'captador', 'outro'];

const EMPTY_AGENCY = { name: '', cnpj: '', creci: '', phone: '', email: '', city: '', state: '', address: '', notes: '' };
const EMPTY_USER   = { name: '', role: 'corretor', email: '', phone: '', creci: '', notes: '' };

export default function ParceirasPage() {
  const { currentWorkspace } = useAuth();
  const showToast = useToast(s => s.show);
  const wsId = currentWorkspace?.id;

  const [agencies,     setAgencies]     = useState<Agency[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [users,        setUsers]        = useState<Record<string, AgencyUser[]>>({});
  const [loadingUsers, setLoadingUsers] = useState<string | null>(null);

  // Agency form
  const [agencyModal,  setAgencyModal]  = useState<'new' | string | null>(null);
  const [agencyForm,   setAgencyForm]   = useState(EMPTY_AGENCY);
  const [savingAgency, setSavingAgency] = useState(false);

  // User form
  const [userModal,    setUserModal]    = useState<{ agencyId: string; userId?: string } | null>(null);
  const [userForm,     setUserForm]     = useState(EMPTY_USER);
  const [savingUser,   setSavingUser]   = useState(false);

  // Portal
  const [generatingToken, setGeneratingToken] = useState<string | null>(null);
  const [copiedId,        setCopiedId]        = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${wsId}/parceiras`);
      setAgencies(data);
    } finally { setLoading(false); }
  }, [wsId]);

  useEffect(() => { load(); }, [load]);

  async function loadUsers(agencyId: string) {
    if (users[agencyId]) return;
    setLoadingUsers(agencyId);
    try {
      const { data } = await api.get(`/workspaces/${wsId}/parceiras/${agencyId}/users`);
      setUsers(prev => ({ ...prev, [agencyId]: data }));
    } finally { setLoadingUsers(null); }
  }

  function toggleExpand(agencyId: string) {
    if (expanded === agencyId) { setExpanded(null); return; }
    setExpanded(agencyId);
    loadUsers(agencyId);
  }

  // ── Agency CRUD ─────────────────────────────────────────────────────────
  function openNewAgency()        { setAgencyForm(EMPTY_AGENCY); setAgencyModal('new'); }
  function openEditAgency(a: Agency) {
    setAgencyForm({ name: a.name, cnpj: a.cnpj||'', creci: a.creci||'', phone: a.phone||'',
      email: a.email||'', city: a.city||'', state: a.state||'', address: a.address||'', notes: a.notes||'' });
    setAgencyModal(a.id);
  }

  async function saveAgency() {
    if (!wsId || !agencyForm.name.trim()) return;
    setSavingAgency(true);
    try {
      if (agencyModal === 'new') {
        await api.post(`/workspaces/${wsId}/parceiras`, agencyForm);
      } else {
        await api.put(`/workspaces/${wsId}/parceiras/${agencyModal}`, agencyForm);
      }
      setAgencyModal(null);
      setUsers({});
      load();
    } finally { setSavingAgency(false); }
  }

  async function deleteAgency(id: string, name: string) {
    if (!wsId || !confirm(`Remover a parceira "${name}" e todos os seus usuários?`)) return;
    await api.delete(`/workspaces/${wsId}/parceiras/${id}`);
    load();
  }

  // ── User CRUD ────────────────────────────────────────────────────────────
  function openNewUser(agencyId: string) {
    setUserForm(EMPTY_USER);
    setUserModal({ agencyId });
  }
  function openEditUser(agencyId: string, u: AgencyUser) {
    setUserForm({ name: u.name, role: u.role, email: u.email||'', phone: u.phone||'', creci: u.creci||'', notes: u.notes||'' });
    setUserModal({ agencyId, userId: u.id });
  }

  async function saveUser() {
    if (!wsId || !userModal || !userForm.name.trim()) return;
    setSavingUser(true);
    try {
      if (userModal.userId) {
        await api.put(`/workspaces/${wsId}/parceiras/${userModal.agencyId}/users/${userModal.userId}`, userForm);
      } else {
        await api.post(`/workspaces/${wsId}/parceiras/${userModal.agencyId}/users`, userForm);
      }
      setUserModal(null);
      setUsers(prev => { const n = { ...prev }; delete n[userModal.agencyId]; return n; });
      loadUsers(userModal.agencyId);
    } finally { setSavingUser(false); }
  }

  async function deleteUser(agencyId: string, userId: string, name: string) {
    if (!wsId || !confirm(`Remover o usuário "${name}"?`)) return;
    await api.delete(`/workspaces/${wsId}/parceiras/${agencyId}/users/${userId}`);
    setUsers(prev => ({ ...prev, [agencyId]: (prev[agencyId] || []).filter(u => u.id !== userId) }));
  }

  // ── Portal ───────────────────────────────────────────────────────────────
  async function generateToken(agencyId: string, userId: string) {
    if (!wsId) return;
    setGeneratingToken(userId);
    try {
      const { data } = await api.post(
        `/workspaces/${wsId}/parceiras/${agencyId}/users/${userId}/generate-token`, {}
      );
      setUsers(prev => ({
        ...prev,
        [agencyId]: (prev[agencyId] || []).map(u => u.id === userId ? { ...u, portal_token: data.portal_token, portal_active: true } : u),
      }));
      showToast('Link do portal gerado');
    } finally { setGeneratingToken(null); }
  }

  async function togglePortal(agencyId: string, userId: string, active: boolean) {
    if (!wsId) return;
    const { data } = await api.put(`/workspaces/${wsId}/parceiras/${agencyId}/users/${userId}`, { portalActive: active });
    setUsers(prev => ({
      ...prev,
      [agencyId]: (prev[agencyId] || []).map(u => u.id === userId ? { ...u, portal_active: data.portal_active } : u),
    }));
  }

  function copyLink(token: string, userId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/portal-parceiro/${token}`).then(() => {
      setCopiedId(userId);
      showToast('Link copiado!');
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const filtered = agencies.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.city || '').toLowerCase().includes(search.toLowerCase())
  );

  if (!wsId) return null;

  return (
    <>
      <Header
        title="Parceiras Comerciais"
        actions={
          <button className="btn-primary" onClick={openNewAgency}>
            <Plus className="w-4 h-4" /> Nova parceira
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {/* Info */}
          <div className="card p-4 mb-5 bg-blue-50 border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-0.5">Como funciona</p>
            <p className="text-xs text-blue-700">
              Cadastre as imobiliárias parceiras e adicione os usuários de cada uma (corretores, auxiliares, gerentes).
              Cada usuário recebe um link de portal exclusivo para visualizar os empreendimentos e enviar propostas.
            </p>
          </div>

          {/* Busca */}
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Buscar parceira..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Lista */}
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="card p-4 h-16 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-semibold text-gray-600 mb-1">Nenhuma parceira cadastrada</p>
              <button className="btn-primary mt-4" onClick={openNewAgency}><Plus className="w-4 h-4" /> Cadastrar primeira parceira</button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(agency => (
                <div key={agency.id} className="card overflow-hidden">
                  {/* Cabeçalho da agência */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleExpand(agency.id)}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-black text-lg flex-shrink-0">
                      {agency.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{agency.name}</span>
                        {!agency.active && <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Inativa</span>}
                        {agency.creci && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">CRECI-J {agency.creci}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {agency.city && <span className="text-xs text-gray-400">{agency.city}{agency.state && ` · ${agency.state}`}</span>}
                        {agency.phone && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="w-3 h-3" />{agency.phone}</span>}
                        {agency.email && <span className="flex items-center gap-1 text-xs text-gray-400"><Mail className="w-3 h-3" />{agency.email}</span>}
                        <span className="flex items-center gap-1 text-xs text-gray-400"><Users className="w-3 h-3" />{agency.users_count} usuários</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); openEditAgency(agency); }} className="p-1.5 text-gray-300 hover:text-brand-500 rounded transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteAgency(agency.id, agency.name); }} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expanded === agency.id
                        ? <ChevronDown className="w-4 h-4 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </div>

                  {/* Usuários da agência */}
                  {expanded === agency.id && (
                    <div className="border-t border-gray-100 bg-gray-50/50">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Usuários</span>
                        <button onClick={() => openNewUser(agency.id)} className="btn-secondary btn-sm text-xs">
                          <UserPlus className="w-3 h-3" /> Adicionar usuário
                        </button>
                      </div>

                      {loadingUsers === agency.id ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
                      ) : (users[agency.id] || []).length === 0 ? (
                        <div className="text-center py-5 text-gray-400 text-xs">
                          <User className="w-5 h-5 mx-auto mb-1 opacity-30" />
                          Nenhum usuário. Adicione corretores, auxiliares ou gerentes.
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {(users[agency.id] || []).map(u => (
                            <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 font-bold text-sm flex-shrink-0">
                                {u.name[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-800 text-sm">{u.name}</span>
                                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full capitalize">{u.role}</span>
                                  {u.creci && <span className="text-xs text-gray-400">CRECI {u.creci}</span>}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                  {u.phone && <span className="text-xs text-gray-400">{u.phone}</span>}
                                  {u.email && <span className="text-xs text-gray-400">{u.email}</span>}
                                </div>
                              </div>
                              {/* Ações de portal */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {u.portal_token ? (
                                  <>
                                    <button
                                      onClick={() => copyLink(u.portal_token!, u.id)}
                                      className={clsx('flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors',
                                        copiedId === u.id ? 'border-green-300 text-green-600 bg-green-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                      )}
                                    >
                                      {copiedId === u.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                      {copiedId === u.id ? 'Copiado' : 'Portal'}
                                    </button>
                                    <a href={`/portal-parceiro/${u.portal_token}`} target="_blank" rel="noopener noreferrer"
                                      className="p-1.5 text-gray-300 hover:text-brand-500 rounded" title="Abrir portal">
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                    <button onClick={() => togglePortal(agency.id, u.id, !u.portal_active)} className="p-1.5 rounded" title={u.portal_active ? 'Desativar' : 'Ativar'}>
                                      {u.portal_active
                                        ? <Shield className="w-3.5 h-3.5 text-green-500" />
                                        : <ShieldOff className="w-3.5 h-3.5 text-gray-300" />
                                      }
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => generateToken(agency.id, u.id)}
                                    disabled={generatingToken === u.id}
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                                  >
                                    {generatingToken === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                                    Gerar link
                                  </button>
                                )}
                                <button onClick={() => openEditUser(agency.id, u)} className="p-1.5 text-gray-300 hover:text-brand-500 rounded transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteUser(agency.id, u.id, u.name)} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de agência */}
      {agencyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{agencyModal === 'new' ? 'Nova parceira' : 'Editar parceira'}</h3>
              <button onClick={() => setAgencyModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <div>
                <label className="label">Nome da imobiliária / empresa <span className="text-red-500">*</span></label>
                <input className="input" value={agencyForm.name} onChange={e => setAgencyForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Imobiliária Santos & Silva" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">CNPJ</label>
                  <input className="input font-mono" value={agencyForm.cnpj} onChange={e => setAgencyForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="label">CRECI-J</label>
                  <input className="input" value={agencyForm.creci} onChange={e => setAgencyForm(f => ({ ...f, creci: e.target.value }))} placeholder="000000-J" />
                </div>
                <div>
                  <label className="label">Telefone</label>
                  <input className="input" value={agencyForm.phone} onChange={e => setAgencyForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 0000-0000" />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input className="input" type="email" value={agencyForm.email} onChange={e => setAgencyForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@imobiliaria.com" />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input className="input" value={agencyForm.city} onChange={e => setAgencyForm(f => ({ ...f, city: e.target.value }))} placeholder="Ex: Goiânia" />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <input className="input" value={agencyForm.state} onChange={e => setAgencyForm(f => ({ ...f, state: e.target.value }))} placeholder="GO" maxLength={2} />
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={2} value={agencyForm.notes} onChange={e => setAgencyForm(f => ({ ...f, notes: e.target.value }))} placeholder="Condições de parceria, regiões de atuação..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
              <button className="btn-secondary" onClick={() => setAgencyModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveAgency} disabled={savingAgency || !agencyForm.name.trim()}>
                {savingAgency ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de usuário */}
      {userModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{userModal.userId ? 'Editar usuário' : 'Novo usuário'}</h3>
              <button onClick={() => setUserModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Nome completo <span className="text-red-500">*</span></label>
                <input className="input" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome da pessoa" required />
              </div>
              <div>
                <label className="label">Cargo / Função</label>
                <div className="flex gap-2 flex-wrap mb-1.5">
                  {ROLE_OPTIONS.map(r => (
                    <button key={r} type="button" onClick={() => setUserForm(f => ({ ...f, role: r }))}
                      className={clsx('px-2.5 py-1 rounded-full text-xs border-2 transition-all capitalize',
                        userForm.role === r ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-500'
                      )}
                    >{r}</button>
                  ))}
                </div>
                <input className="input" placeholder="Ou digite um cargo personalizado..." value={ROLE_OPTIONS.includes(userForm.role) ? '' : userForm.role}
                  onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input className="input" value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input className="input" type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="pessoa@email.com" />
                </div>
                <div>
                  <label className="label">CRECI (opcional)</label>
                  <input className="input" value={userForm.creci} onChange={e => setUserForm(f => ({ ...f, creci: e.target.value }))} placeholder="000000-F" />
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={2} value={userForm.notes} onChange={e => setUserForm(f => ({ ...f, notes: e.target.value }))} placeholder="..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
              <button className="btn-secondary" onClick={() => setUserModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveUser} disabled={savingUser || !userForm.name.trim()}>
                {savingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
