'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  Search, Filter, Send, Users, MapPin, Building2,
  Home, DollarSign, User, CheckSquare, Square, X, Loader2,
} from 'lucide-react';
import clsx from 'clsx';

interface AiProfile {
  cidade_interesse?: string;
  empreendimento_interesse?: string;
  perfil?: 'investidor' | 'morador' | 'empresa';
  tipo_imovel?: string;
  faixa_valor_min?: number;
  faixa_valor_max?: number;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  ai_profile: AiProfile;
  conversation_count: number;
  created_at: string;
}

const PERFIL_LABELS: Record<string, string> = {
  investidor: 'Investidor',
  morador:    'Morador',
  empresa:    'Empresa',
};

const PERFIL_COLORS: Record<string, string> = {
  investidor: 'bg-purple-100 text-purple-700',
  morador:    'bg-blue-100 text-blue-700',
  empresa:    'bg-amber-100 text-amber-700',
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function formatFaixa(min?: number, max?: number): string {
  if (min && max) return `${brl.format(min)} – ${brl.format(max)}`;
  if (min) return `A partir de ${brl.format(min)}`;
  if (max) return `Até ${brl.format(max)}`;
  return '';
}

export default function LeadsPage() {
  const { currentWorkspace } = useAuth();
  const wsId = currentWorkspace?.id;

  // Filtros
  const [search,    setSearch]    = useState('');
  const [aiCity,    setAiCity]    = useState('');
  const [aiDev,     setAiDev]     = useState('');
  const [aiPerfil,  setAiPerfil]  = useState('');
  const [onlyAi,    setOnlyAi]    = useState(true);

  // Dados
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);

  // Seleção
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Disparo
  const [showMsg,   setShowMsg]   = useState(false);
  const [message,   setMessage]   = useState('');
  const [sending,   setSending]   = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; errors: { contactId: string; error: string }[] } | null>(null);

  const LIMIT = 50;

  const load = useCallback(async (p = 1) => {
    if (!wsId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(LIMIT),
        ...(search    ? { search }             : {}),
        ...(aiCity    ? { aiCity }             : {}),
        ...(aiDev     ? { aiDevelopment: aiDev } : {}),
        ...(aiPerfil  ? { aiPerfil }           : {}),
        ...(onlyAi    ? { hasAiProfile: 'true' } : {}),
      });
      const { data: res } = await api.get(`/workspaces/${wsId}/contacts?${params}`);
      setLeads(res.data);
      setTotal(res.total);
      setPage(p);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [wsId, search, aiCity, aiDev, aiPerfil, onlyAi]);

  useEffect(() => { load(1); }, [load]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.id)));
    }
  }

  async function sendMassMessage() {
    if (!wsId || !message.trim() || selected.size === 0) return;
    setSending(true);
    setSendResult(null);
    try {
      const { data } = await api.post(`/workspaces/${wsId}/contacts/mass-message`, {
        contactIds: Array.from(selected),
        message: message.trim(),
      });
      setSendResult(data);
      setMessage('');
    } catch {
      setSendResult({ sent: 0, errors: [{ contactId: '', error: 'Erro ao enviar. Tente novamente.' }] });
    } finally {
      setSending(false);
    }
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col h-full">
      <Header title="Leads Qualificados" subtitle={`${total} contatos com perfil identificado pela IA`} />

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">

        {/* Filtros */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
            <Filter className="w-4 h-4" /> Filtros
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="relative col-span-2 md:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Nome ou telefone"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Cidade de interesse"
                value={aiCity}
                onChange={e => setAiCity(e.target.value)}
              />
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="Empreendimento"
                value={aiDev}
                onChange={e => setAiDev(e.target.value)}
              />
            </div>
            <div>
              <select className="input" value={aiPerfil} onChange={e => setAiPerfil(e.target.value)}>
                <option value="">Todos os perfis</option>
                <option value="investidor">Investidor</option>
                <option value="morador">Morador</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={onlyAi}
              onChange={e => setOnlyAi(e.target.checked)}
            />
            Mostrar apenas leads com perfil identificado pela IA
          </label>
        </div>

        {/* Toolbar de seleção */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-blue-700">
              {selected.size} lead{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMsg(true)}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Enviar mensagem
              </button>
              <button onClick={() => setSelected(new Set())} className="btn btn-ghost btn-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-700">
                    {selected.size === leads.length && leads.length > 0
                      ? <CheckSquare className="w-4 h-4 text-blue-600" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Lead</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cidade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empreendimento</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Perfil</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo de imóvel</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Faixa de valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Carregando...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhum lead encontrado</p>
                    <p className="text-gray-300 text-xs mt-1">Os leads aparecem aqui conforme a IA os qualifica nas conversas</p>
                  </td>
                </tr>
              ) : leads.map(lead => {
                const prof = lead.ai_profile || {};
                const isSelected = selected.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={clsx('hover:bg-gray-50 transition-colors', isSelected && 'bg-blue-50')}
                  >
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(lead.id)}>
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-gray-400" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{lead.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{lead.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      {prof.cidade_interesse
                        ? <span className="flex items-center gap-1 text-gray-700"><MapPin className="w-3.5 h-3.5 text-gray-400" />{prof.cidade_interesse}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {prof.empreendimento_interesse
                        ? <span className="flex items-center gap-1 text-gray-700"><Building2 className="w-3.5 h-3.5 text-gray-400" />{prof.empreendimento_interesse}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {prof.perfil
                        ? <span className={clsx('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', PERFIL_COLORS[prof.perfil] || 'bg-gray-100 text-gray-600')}>
                            <User className="w-3 h-3" />{PERFIL_LABELS[prof.perfil] || prof.perfil}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {prof.tipo_imovel
                        ? <span className="flex items-center gap-1 text-gray-700 capitalize"><Home className="w-3.5 h-3.5 text-gray-400" />{prof.tipo_imovel}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(prof.faixa_valor_min || prof.faixa_valor_max)
                        ? <span className="flex items-center gap-1 text-gray-700 text-xs"><DollarSign className="w-3.5 h-3.5 text-gray-400" />{formatFaixa(prof.faixa_valor_min, prof.faixa_valor_max)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Paginação */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-xs text-gray-500">{total} leads encontrados</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(pages, 8) }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => load(p)}
                    className={clsx('w-8 h-8 text-xs rounded', p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de envio em massa */}
      {showMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Enviar mensagem em massa</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selected.size} lead{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => { setShowMsg(false); setSendResult(null); }} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {sendResult ? (
                <div className={clsx('rounded-lg p-4 text-sm', sendResult.sent > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                  <p className="font-medium mb-1">
                    {sendResult.sent} mensagem{sendResult.sent !== 1 ? 's' : ''} enviada{sendResult.sent !== 1 ? 's' : ''}
                    {sendResult.errors.length > 0 ? ` · ${sendResult.errors.length} erro${sendResult.errors.length !== 1 ? 's' : ''}` : ''}
                  </p>
                  {sendResult.errors.length > 0 && (
                    <ul className="list-disc list-inside text-xs mt-1 opacity-80">
                      {sendResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e.error}</li>)}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Mensagem</label>
                    <textarea
                      className="input min-h-[120px] resize-y"
                      placeholder="Digite a mensagem que será enviada para os leads selecionados..."
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      A mensagem será enviada via a última conversa ativa de cada lead.
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                    Envios em massa respeitam as conversas existentes. Leads sem conversa ativa serão ignorados.
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
              <button onClick={() => { setShowMsg(false); setSendResult(null); }} className="btn btn-ghost">
                {sendResult ? 'Fechar' : 'Cancelar'}
              </button>
              {!sendResult && (
                <button
                  onClick={sendMassMessage}
                  disabled={!message.trim() || sending}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar para {selected.size} lead{selected.size !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
