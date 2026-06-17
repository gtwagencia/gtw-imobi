'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { Contact, ProposalStatus, PropertyProposal } from '@/types';
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS, formatCurrency } from '@/lib/propertyConstants';
import { Plus, Trash2, Loader2, Copy, Check, FileText, PenLine, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface ProposalsPanelProps {
  workspaceId: string;
  propertyId: string;
}

export default function ProposalsPanel({ workspaceId, propertyId }: ProposalsPanelProps) {
  const [proposals, setProposals] = useState<PropertyProposal[]>([]);
  const [contacts,  setContacts]  = useState<Contact[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [copiedId,   setCopiedId]   = useState<string | null>(null);
  const [signingId,  setSigningId]  = useState<string | null>(null);

  const [buyerName,         setBuyerName]         = useState('');
  const [buyerDocument,     setBuyerDocument]     = useState('');
  const [buyerEmail,        setBuyerEmail]        = useState('');
  const [buyerPhone,        setBuyerPhone]        = useState('');
  const [proposedPrice,     setProposedPrice]     = useState('');
  const [paymentConditions, setPaymentConditions] = useState('');
  const [validityDate,      setValidityDate]      = useState('');

  const base = `/workspaces/${workspaceId}/properties/${propertyId}/proposals`;

  async function load() {
    setLoading(true);
    try {
      const [proposalsRes, contactsRes] = await Promise.all([
        api.get<PropertyProposal[]>(base),
        api.get<{ data: Contact[] }>(`/workspaces/${workspaceId}/contacts`, { params: { limit: 200 } }),
      ]);
      setProposals(proposalsRes.data);
      setContacts(contactsRes.data.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBuyerNameChange(name: string) {
    setBuyerName(name);
    const contact = contacts.find(c => c.name === name);
    if (contact) {
      setBuyerEmail(contact.email || '');
      setBuyerPhone(contact.phone || '');
    }
  }

  async function handleCreate() {
    if (!buyerName.trim() || !proposedPrice) return;
    setCreating(true);
    try {
      const { data } = await api.post<PropertyProposal>(base, {
        buyerName:         buyerName.trim(),
        buyerDocument:     buyerDocument.trim() || null,
        buyerEmail:        buyerEmail.trim() || null,
        buyerPhone:        buyerPhone.trim() || null,
        proposedPrice:     Number(proposedPrice),
        paymentConditions: paymentConditions.trim() || null,
        validityDate:      validityDate || null,
      });
      setProposals(prev => [data, ...prev]);
      setBuyerName(''); setBuyerDocument(''); setBuyerEmail(''); setBuyerPhone('');
      setProposedPrice(''); setPaymentConditions(''); setValidityDate('');
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateStatus(id: string, status: ProposalStatus) {
    const { data } = await api.put<PropertyProposal>(`${base}/${id}`, { status });
    setProposals(prev => prev.map(p => p.id === id ? data : p));
  }

  async function handleRemove(id: string) {
    if (!confirm('Remover esta proposta?')) return;
    await api.delete(`${base}/${id}`);
    setProposals(prev => prev.filter(p => p.id !== id));
  }

  async function handleCopyLink(proposal: PropertyProposal) {
    const url = `${window.location.origin}/proposta/${proposal.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(proposal.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSendToSign(proposal: PropertyProposal) {
    if (!confirm(`Enviar proposta de "${proposal.buyer_name}" para assinatura via ZapSign?`)) return;
    setSigningId(proposal.id);
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/zapsign/proposals/${proposal.id}/sign`);
      if (data.sign_url) {
        setProposals(prev => prev.map(p => p.id === proposal.id
          ? { ...p, zapsign_sign_url: data.sign_url, zapsign_doc_token: data.doc_token, signature_status: 'aguardando' }
          : p
        ));
      }
    } catch {
      alert('Erro ao enviar para ZapSign. Verifique se o token da API está configurado em Configurações e se a proposta tem um PDF gerado.');
    } finally {
      setSigningId(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="font-semibold text-gray-900">Propostas / contratos</h3>
          <p className="text-xs text-gray-400 mt-0.5">Gere um link com a proposta para o cliente visualizar e assinar eletronicamente</p>
        </div>
        <button type="button" className="btn-secondary text-sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4" />
          Nova proposta
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-3 my-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comprador/proponente *</label>
              <input
                list="proposal-buyers-list"
                className="input text-sm"
                value={buyerName}
                onChange={(e) => handleBuyerNameChange(e.target.value)}
                placeholder="Nome completo"
              />
              <datalist id="proposal-buyers-list">
                {contacts.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CPF/CNPJ</label>
              <input className="input text-sm" value={buyerDocument} onChange={(e) => setBuyerDocument(e.target.value)} placeholder="000.000.000-00" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input text-sm" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="E-mail" />
            <input className="input text-sm" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="Telefone" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor proposto *</label>
              <input className="input text-sm" type="number" min="0" step="0.01" value={proposedPrice} onChange={(e) => setProposedPrice(e.target.value)} placeholder="R$" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Validade da proposta</label>
              <input className="input text-sm" type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Condições de pagamento</label>
              <input className="input text-sm" value={paymentConditions} onChange={(e) => setPaymentConditions(e.target.value)} placeholder="Ex: entrada + 12x..." />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-primary text-xs" disabled={creating || !buyerName.trim() || !proposedPrice} onClick={handleCreate}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Gerar proposta
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-4 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : proposals.length === 0 ? (
        <p className="text-xs text-gray-400 italic mt-2">Nenhuma proposta gerada para este imóvel ainda.</p>
      ) : (
        <div className="space-y-2 mt-2">
          {proposals.map(p => (
            <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.buyer_name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {formatCurrency(p.proposed_price)}
                  {p.validity_date ? ` · válida até ${new Date(p.validity_date).toLocaleDateString('pt-BR')}` : ''}
                  {p.signed_at ? ` · assinada em ${new Date(p.signed_at).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              <select
                className={clsx('input text-xs w-auto border-0 py-1', PROPOSAL_STATUS_COLORS[p.status])}
                value={p.status}
                disabled={p.status === 'assinada'}
                onChange={(e) => handleUpdateStatus(p.id, e.target.value as ProposalStatus)}
              >
                {Object.entries(PROPOSAL_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {/* Assinatura ZapSign */}
              {p.signature_status === 'assinado' ? (
                <span className="badge-green text-xs whitespace-nowrap">Assinado</span>
              ) : p.zapsign_sign_url ? (
                <a href={p.zapsign_sign_url} target="_blank" rel="noreferrer"
                  className="btn-ghost text-sm p-1 text-indigo-600 hover:bg-indigo-50" title="Abrir link de assinatura">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <button type="button" className="btn-ghost text-sm p-1 text-violet-600 hover:bg-violet-50"
                  title="Enviar para assinatura eletrônica (ZapSign)"
                  disabled={signingId === p.id}
                  onClick={() => handleSendToSign(p)}>
                  {signingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
                </button>
              )}
              <button type="button" className="btn-ghost text-sm p-1" title="Copiar link da proposta" onClick={() => handleCopyLink(p)}>
                {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button type="button" className="btn-ghost text-sm text-red-500 hover:bg-red-50 p-1" title="Remover proposta" onClick={() => handleRemove(p.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
