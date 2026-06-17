'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { Plus, Trash2, Pencil, X, Check, Loader2, Users, Phone, Mail, CreditCard, Search, Link2, Copy, ExternalLink, Shield, ShieldOff } from 'lucide-react';

interface PartnerBroker {
  id: string;
  name: string;
  agency_name: string | null;
  creci: string | null;
  phone: string | null;
  email: string | null;
  pix_key: string | null;
  notes: string | null;
  portal_token: string | null;
  portal_active: boolean;
  created_at: string;
}

const EMPTY: Omit<PartnerBroker, 'id' | 'created_at'> = {
  name: '', agency_name: '', creci: '', phone: '', email: '', pix_key: '', notes: '',
  portal_token: null, portal_active: false,
};

export default function CorretoresParceirosPage() {
  const { currentWorkspace } = useAuth();
  const [brokers,      setBrokers]      = useState<PartnerBroker[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [editing,      setEditing]      = useState<string | null>(null);
  const [form,         setForm]         = useState<typeof EMPTY>(EMPTY);
  const [saving,       setSaving]       = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/partner-brokers`);
      setBrokers(data);
    } finally { setLoading(false); }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm(EMPTY);
    setEditing('new');
  }

  function openEdit(b: PartnerBroker) {
    setForm({ name: b.name, agency_name: b.agency_name || '', creci: b.creci || '', phone: b.phone || '', email: b.email || '', pix_key: b.pix_key || '', notes: b.notes || '' });
    setEditing(b.id);
  }

  async function handleSave() {
    if (!currentWorkspace || !form.name.trim()) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post(`/workspaces/${currentWorkspace.id}/partner-brokers`, form);
      } else {
        await api.put(`/workspaces/${currentWorkspace.id}/partner-brokers/${editing}`, form);
      }
      setEditing(null);
      load();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!currentWorkspace || !confirm(`Remover o corretor "${name}"?`)) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/partner-brokers/${id}`);
    load();
  }

  async function handleGenerateToken(brokerId: string) {
    if (!currentWorkspace) return;
    setGeneratingId(brokerId);
    try {
      const { data } = await api.post(
        `/workspaces/${currentWorkspace.id}/partner-portal/brokers/${brokerId}/generate-token`,
        { developmentIds: [] }
      );
      setBrokers(prev => prev.map(b => b.id === brokerId ? { ...b, portal_token: data.portal_token, portal_active: true } : b));
    } finally { setGeneratingId(null); }
  }

  async function handleTogglePortal(brokerId: string, active: boolean) {
    if (!currentWorkspace) return;
    const { data } = await api.put(
      `/workspaces/${currentWorkspace.id}/partner-portal/brokers/${brokerId}/status`,
      { active }
    );
    setBrokers(prev => prev.map(b => b.id === brokerId ? { ...b, portal_active: data.portal_active } : b));
  }

  function copyPortalLink(token: string, brokerId: string) {
    const url = `${window.location.origin}/portal-corretor/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(brokerId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const filtered = brokers.filter(b =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.agency_name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (!currentWorkspace) return null;

  return (
    <>
      <Header
        title="Corretores Parceiros"
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="w-4 h-4" /> Novo parceiro
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl">

        {/* Intro */}
        <div className="card p-4 mb-5 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Gestão de comissionamento</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Cadastre corretores e imobiliárias parceiras que trazem compradores. O split de comissão é configurado no registro de cada venda (em Imóveis → Vendas).
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar parceiro..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Modal de edição */}
        {editing && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">{editing === 'new' ? 'Novo corretor parceiro' : 'Editar corretor'}</h3>
                <button onClick={() => setEditing(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                    <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome do corretor" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Imobiliária / Agência</label>
                    <input className="input" value={form.agency_name || ''} onChange={e => setForm({...form, agency_name: e.target.value})} placeholder="Nome da empresa" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CRECI</label>
                    <input className="input" value={form.creci || ''} onChange={e => setForm({...form, creci: e.target.value})} placeholder="000000-F" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Telefone / WhatsApp</label>
                    <input className="input" value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(11) 99999-9999" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                    <input className="input" type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} placeholder="corretor@email.com" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Chave PIX</label>
                    <input className="input font-mono" value={form.pix_key || ''} onChange={e => setForm({...form, pix_key: e.target.value})} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
                    <textarea className="input resize-none" rows={2} value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Condições de parceria, observações..." />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 p-5 pt-0">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-semibold text-gray-600 mb-1">Nenhum corretor parceiro</p>
            <p className="text-xs">Cadastre corretores externos que trazem compradores e recebem split de comissão.</p>
            <button className="btn-primary mt-4" onClick={openNew}><Plus className="w-4 h-4" /> Cadastrar primeiro parceiro</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <div key={b.id} className="card p-4 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg flex-shrink-0">
                    {b.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900">{b.name}</span>
                      {b.agency_name && <span className="text-xs text-gray-400">· {b.agency_name}</span>}
                      {b.creci && <span className="badge-blue text-xs">CRECI {b.creci}</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      {b.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone className="w-3 h-3" />{b.phone}
                        </span>
                      )}
                      {b.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail className="w-3 h-3" />{b.email}
                        </span>
                      )}
                      {b.pix_key && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <CreditCard className="w-3 h-3" />PIX: <span className="font-mono">{b.pix_key}</span>
                        </span>
                      )}
                    </div>
                    {b.notes && <p className="text-xs text-gray-400 mt-1">{b.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Portal do corretor */}
                    {b.portal_token ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyPortalLink(b.portal_token!, b.id)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          title="Copiar link do portal"
                        >
                          {copiedId === b.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          {copiedId === b.id ? 'Copiado!' : 'Link portal'}
                        </button>
                        <a
                          href={`/portal-corretor/${b.portal_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-brand-500 rounded-lg hover:bg-gray-100"
                          title="Abrir portal"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleTogglePortal(b.id, !b.portal_active)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          title={b.portal_active ? 'Desativar acesso' : 'Ativar acesso'}
                        >
                          {b.portal_active
                            ? <Shield className="w-3.5 h-3.5 text-green-500" />
                            : <ShieldOff className="w-3.5 h-3.5 text-gray-300" />
                          }
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateToken(b.id)}
                        disabled={generatingId === b.id}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        {generatingId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                        Gerar portal
                      </button>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <button onClick={() => openEdit(b)} className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-gray-100">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(b.id, b.name)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
