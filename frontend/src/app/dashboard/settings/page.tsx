'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api, { API_URL } from '@/lib/api';
import type { BusinessHours, BusinessHoursDay } from '@/types';
import { Save, Eye, EyeOff, Brain, Clock, MessageSquare, CheckCircle, Sparkles, Globe, Copy, Check, RefreshCw, ShieldCheck, AlertTriangle, Percent, Star, Building2, LayoutGrid, Key, Megaphone, Pen, HardDrive } from 'lucide-react';
import clsx from 'clsx';
import ModulesCard from '@/components/settings/ModulesCard';

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'workspace.update':                 'Configurações do workspace alteradas',
  'workspace.site_token_regenerated': 'Token de integração do site regenerado',
  'workspace.custom_domain_verified': 'Domínio personalizado verificado',
  'member.role_changed':              'Papel de membro alterado',
  'member.removed':                   'Membro removido',
  'member.password_reset':            'Senha de membro redefinida',
  'permission_profile.update':        'Perfil de permissões atualizado',
  '2fa.enable':                       'Verificação em duas etapas ativada',
  '2fa.disable':                      'Verificação em duas etapas desativada',
  'auth.account_locked':              'Conta bloqueada por tentativas de login',
  'contact.merge':                    'Contatos duplicados mesclados',
};

const DOMAIN_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  none:     { label: 'Não configurado',         className: 'bg-gray-100 text-gray-600' },
  pending:  { label: 'Pendente de verificação',  className: 'bg-yellow-100 text-yellow-700' },
  verified: { label: 'Verificado',               className: 'bg-green-100 text-green-700' },
  error:    { label: 'Falha na verificação',     className: 'bg-red-100 text-red-700' },
};

// ── Default business hours ───────────────────────────────────────────────────

const DEFAULT_DAY: BusinessHoursDay = { open: '08:00', close: '18:00', enabled: true };
const DEFAULT_DAY_OFF: BusinessHoursDay = { open: '08:00', close: '12:00', enabled: false };

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled:   false,
  timezone:  'America/Sao_Paulo',
  monday:    { ...DEFAULT_DAY },
  tuesday:   { ...DEFAULT_DAY },
  wednesday: { ...DEFAULT_DAY },
  thursday:  { ...DEFAULT_DAY },
  friday:    { ...DEFAULT_DAY },
  saturday:  { ...DEFAULT_DAY_OFF },
  sunday:    { ...DEFAULT_DAY_OFF },
};

const DAY_LABELS: Record<string, string> = {
  monday:    'Segunda',
  tuesday:   'Terça',
  wednesday: 'Quarta',
  thursday:  'Quinta',
  friday:    'Sexta',
  saturday:  'Sábado',
  sunday:    'Domingo',
};

const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { currentWorkspace, setWorkspace, user, currentOrg } = useAuth();
  const router = useRouter();
  const isSuperAdmin = user?.is_super_admin === true;

  const isPlatformAdmin = isSuperAdmin
    || currentOrg?.role === 'owner'
    || currentOrg?.role === 'admin';

  useEffect(() => {
    if (user && !isPlatformAdmin) {
      router.replace('/dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isPlatformAdmin]);

  const [form, setForm] = useState({
    name:                 '',
    timezone:             'America/Sao_Paulo',
    businessModel:        'imobiliaria' as 'imobiliaria' | 'construtora',
    metaPixelId:          '',
    metaAdAccountId:      '',
    metaAccessToken:      '',
    metaConversionsToken: '',
    followUpEnabled:      false,
    aiAnalysisEnabled:         false,
    aiAnalysisIntervalMinutes: 60,
    ticketStorageQuotaMb:      5120,
    aiIgnoreGroups:       true,
    anthropicApiKey:      '',
    openaiApiKey:         '',
    geminiApiKey:         '',
    aiProvider:           'anthropic',
    aiModel:              '',
    aiBaseUrl:            '',
    customAiApiKey:       '',
    aiToolsEnabled:       false,
    aiAgentName:          'Lia',
    customDomain:         '',
    slaResponseMinutes:   30,
    leadStaleHours:       24,
    defaultCommissionPct: '',
    descriptionAiProvider: 'anthropic',
    descriptionAiModel:    '',
    npsEnabled:            false,
    npsDelayHours:         24,
    npsMessageTemplate:    '',
    zapsignApiToken:       '',
  });

  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [showTokens,    setShowTokens]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [copiedField,   setCopiedField]   = useState<string | null>(null);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [domainError,     setDomainError]     = useState('');
  const [auditLogs,        setAuditLogs]       = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    if (currentWorkspace) {
      setForm({
        name:                 currentWorkspace.name,
        timezone:             currentWorkspace.timezone,
        businessModel:        currentWorkspace.business_model || 'imobiliaria',
        metaPixelId:          currentWorkspace.meta_pixel_id || '',
        metaAdAccountId:      currentWorkspace.meta_ad_account_id || '',
        metaAccessToken:      '',
        metaConversionsToken: '',
        followUpEnabled:      currentWorkspace.follow_up_enabled ?? false,
        aiAnalysisEnabled:         currentWorkspace.ai_analysis_enabled ?? false,
        aiAnalysisIntervalMinutes: currentWorkspace.ai_analysis_interval_minutes ?? 60,
        ticketStorageQuotaMb:      currentWorkspace.ticket_storage_quota_mb ?? 5120,
        aiIgnoreGroups:       currentWorkspace.ai_ignore_groups ?? true,
        anthropicApiKey:      '',
        openaiApiKey:         '',
        geminiApiKey:         '',
        aiProvider:           currentWorkspace.ai_provider || 'anthropic',
        aiModel:              currentWorkspace.ai_model    || '',
        aiBaseUrl:            currentWorkspace.ai_base_url || '',
        customAiApiKey:       '',
        aiToolsEnabled:       currentWorkspace.ai_tools_enabled ?? false,
        aiAgentName:          currentWorkspace.ai_agent_name || 'Lia',
        customDomain:         currentWorkspace.custom_domain || '',
        slaResponseMinutes:   currentWorkspace.sla_response_minutes ?? 30,
        leadStaleHours:       currentWorkspace.lead_stale_hours ?? 24,
        defaultCommissionPct:  currentWorkspace.default_commission_pct != null ? String(currentWorkspace.default_commission_pct) : '',
        descriptionAiProvider: currentWorkspace.description_ai_provider || 'anthropic',
        descriptionAiModel:    currentWorkspace.description_ai_model    || '',
        npsEnabled:            Boolean(currentWorkspace.nps_enabled),
        npsDelayHours:         currentWorkspace.nps_delay_hours         ?? 24,
        npsMessageTemplate:    currentWorkspace.nps_message_template    || '',
        zapsignApiToken:       '',
      });
      setBusinessHours(currentWorkspace.business_hours ?? DEFAULT_BUSINESS_HOURS);
    }
  }, [currentWorkspace]);

  // Log de auditoria — só carrega para quem tem permissão (admin/owner/superadmin);
  // se o backend retornar 403, simplesmente não exibimos a seção.
  useEffect(() => {
    if (!currentWorkspace) return;
    api.get<AuditLogEntry[]>(`/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}/audit-logs`)
      .then(({ data }) => setAuditLogs(data))
      .catch(() => setAuditLogs(null));
  }, [currentWorkspace]);

  function updateDay(day: typeof DAY_KEYS[number], field: keyof BusinessHoursDay, value: string | boolean) {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        businessHours,
        defaultCommissionPct: form.defaultCommissionPct === '' ? null : Number(form.defaultCommissionPct),
      };
      // Don't send empty tokens (would overwrite existing ones)
      if (!payload.metaAccessToken)      delete payload.metaAccessToken;
      if (!payload.metaConversionsToken) delete payload.metaConversionsToken;
      if (!payload.anthropicApiKey)      delete payload.anthropicApiKey;
      if (!payload.openaiApiKey)         delete payload.openaiApiKey;
      if (!payload.geminiApiKey)         delete payload.geminiApiKey;
      if (!payload.customAiApiKey)       delete payload.customAiApiKey;
      if (!payload.zapsignApiToken)      delete payload.zapsignApiToken;

      const { data } = await api.put(
        `/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}`,
        payload
      );
      setWorkspace(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string, field: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  async function handleRegenerateToken() {
    if (!currentWorkspace) return;
    if (!confirm('Gerar um novo token de integração? As URLs atuais deixarão de funcionar até que você atualize a configuração no site.')) return;
    setRegeneratingToken(true);
    try {
      const { data } = await api.post(
        `/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}/site-integration/regenerate-token`
      );
      setWorkspace(data);
    } finally {
      setRegeneratingToken(false);
    }
  }

  async function handleVerifyDomain() {
    if (!currentWorkspace) return;
    setVerifyingDomain(true);
    setDomainError('');
    try {
      const { data } = await api.post(
        `/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}/custom-domain/verify`
      );
      setWorkspace(data);
      if (data.custom_domain_status !== 'verified') {
        setDomainError('Ainda não encontramos o registro TXT de verificação. Confira a configuração de DNS e tente novamente em alguns minutos (a propagação pode demorar).');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Erro ao verificar domínio';
      setDomainError(msg);
    } finally {
      setVerifyingDomain(false);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Configurações" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  const feedUrl   = `${API_URL}/feeds/${currentWorkspace.id}/properties.xml?token=${currentWorkspace.site_integration_token}`;
  const portalsUrl = `${API_URL}/feeds/${currentWorkspace.id}/portais.xml?token=${currentWorkspace.site_integration_token}`;
  const leadsUrl  = `${API_URL}/webhooks/site-leads/${currentWorkspace.id}?token=${currentWorkspace.site_integration_token}`;
  // Domínio principal da plataforma (extraído da API_URL) — usado nas instruções de DNS do domínio customizado.
  const platformDomain = API_URL.replace(/^https?:\/\//, '').split('/')[0];
  const domainStatus = DOMAIN_STATUS_LABELS[currentWorkspace.custom_domain_status] || DOMAIN_STATUS_LABELS.none;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  type NavGroup = { label: string; items: { id: string; icon: ReactNode; text: string; show?: boolean }[] };
  const navGroups: NavGroup[] = [
    {
      label: 'Geral',
      items: [
        { id: 'workspace',      icon: <Building2 className="w-4 h-4" />,    text: 'Workspace' },
        { id: 'modules',        icon: <LayoutGrid className="w-4 h-4" />,   text: 'Módulos' },
      ],
    },
    {
      label: 'Integrações',
      items: [
        { id: 'meta-ads',       icon: <Megaphone className="w-4 h-4" />,    text: 'Meta Ads' },
        { id: 'site-integration', icon: <Globe className="w-4 h-4" />,      text: 'Site' },
        { id: 'zapsign',        icon: <Pen className="w-4 h-4" />,          text: 'ZapSign' },
      ],
    },
    {
      label: 'Inteligência Artificial',
      items: [
        { id: 'ai-keys',        icon: <Key className="w-4 h-4" />,          text: 'Chaves de API' },
        { id: 'ai-agent',       icon: <MessageSquare className="w-4 h-4" />, text: 'Agente de Atendimento' },
        { id: 'ai-texts',       icon: <Sparkles className="w-4 h-4" />,     text: 'Geração de Textos' },
      ],
    },
    {
      label: 'Operação',
      items: [
        { id: 'business-hours', icon: <Clock className="w-4 h-4" />,        text: 'Horário Comercial' },
        { id: 'nps',            icon: <Star className="w-4 h-4" />,         text: 'NPS pós-visita' },
        { id: 'alerts',         icon: <AlertTriangle className="w-4 h-4" />, text: 'Alertas' },
        { id: 'commission',     icon: <Percent className="w-4 h-4" />,      text: 'Comissionamento' },
      ],
    },
    {
      label: 'Avançado',
      items: [
        { id: 'custom-domain',  icon: <Globe className="w-4 h-4" />,        text: 'Domínio Personalizado' },
        { id: 'audit-logs',     icon: <ShieldCheck className="w-4 h-4" />,  text: 'Log de Auditoria', show: auditLogs !== null },
        { id: 'ticket-storage', icon: <HardDrive className="w-4 h-4" />,    text: 'Armazenamento', show: isSuperAdmin },
      ],
    },
  ];

  return (
    <>
      <Header title="Configurações" />

      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-8 px-4 md:px-8 py-6 max-w-7xl mx-auto">

          {/* ── Sidebar nav ─────────────────────────────────────────── */}
          <aside className="hidden xl:flex flex-col w-52 flex-shrink-0">
            <nav className="sticky top-6 space-y-6">
              {navGroups.map((group) => {
                const visible = group.items.filter(i => i.show !== false);
                if (!visible.length) return null;
                return (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {visible.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => scrollTo(item.id)}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left"
                          >
                            <span className="text-gray-400 flex-shrink-0">{item.icon}</span>
                            <span className="truncate">{item.text}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* ── Conteúdo principal ──────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <form onSubmit={handleSave} className="space-y-6">

              {/* ── Workspace geral ──────────────────────────────────── */}
              <div id="workspace" className="card p-6 scroll-mt-4">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  Workspace
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      className="input"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fuso horário</label>
                    <select
                      className="input"
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    >
                      <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                      <option value="America/Manaus">America/Manaus (AMT)</option>
                      <option value="America/Belem">America/Belem</option>
                      <option value="America/Fortaleza">America/Fortaleza</option>
                      <option value="America/Recife">America/Recife</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de negócio</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className={clsx(
                    'flex-1 flex items-start gap-2 border rounded-lg p-3 cursor-pointer transition-colors',
                    form.businessModel === 'imobiliaria' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                  )}>
                    <input
                      type="radio"
                      name="businessModel"
                      value="imobiliaria"
                      checked={form.businessModel === 'imobiliaria'}
                      onChange={() => setForm({ ...form, businessModel: 'imobiliaria' })}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Imobiliária</div>
                      <div className="text-xs text-gray-500">
                        Trabalha com leads de imóveis de terceiros e/ou empreendimentos de diversas construtoras
                      </div>
                    </div>
                  </label>
                  <label className={clsx(
                    'flex-1 flex items-start gap-2 border rounded-lg p-3 cursor-pointer transition-colors',
                    form.businessModel === 'construtora' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                  )}>
                    <input
                      type="radio"
                      name="businessModel"
                      value="construtora"
                      checked={form.businessModel === 'construtora'}
                      onChange={() => setForm({ ...form, businessModel: 'construtora' })}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">Construtora / Incorporadora</div>
                      <div className="text-xs text-gray-500">
                        Trabalha com seus próprios empreendimentos e unidades lançadas pela própria empresa
                      </div>
                    </div>
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Usado pela IA ({form.aiAgentName || 'Lia'}) para adaptar o tom e o foco das conversas com os contatos.
                </p>
              </div>
            </div>
          </div>

          {/* ── Módulos disponíveis ─────────────────────────────────── */}
          <div id="modules" className="scroll-mt-4">
            <ModulesCard orgId={currentWorkspace.org_id} workspaceId={currentWorkspace.id} />
          </div>

          {/* ── Meta Ads ───────────────────────────────────────────── */}
          <div id="meta-ads" className="card p-6 scroll-mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Meta Ads / Conversions API</h2>
              <button
                type="button"
                onClick={() => setShowTokens(!showTokens)}
                className="btn-ghost text-xs"
              >
                {showTokens
                  ? <><EyeOff className="w-3.5 h-3.5" />Ocultar</>
                  : <><Eye className="w-3.5 h-3.5" />Mostrar</>
                }
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pixel ID</label>
                <input
                  className="input"
                  value={form.metaPixelId}
                  onChange={(e) => setForm({ ...form, metaPixelId: e.target.value })}
                  placeholder="123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Account ID</label>
                <input
                  className="input"
                  value={form.metaAdAccountId}
                  onChange={(e) => setForm({ ...form, metaAdAccountId: e.target.value })}
                  placeholder="act_123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                {currentWorkspace.has_meta_access_token && !form.metaAccessToken && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Chave salva — deixe em branco para manter
                  </div>
                )}
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.metaAccessToken}
                  onChange={(e) => setForm({ ...form, metaAccessToken: e.target.value })}
                  placeholder={currentWorkspace.has_meta_access_token ? '••••••••••••• (manter atual)' : 'Cole o token aqui para configurar'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conversions API Token</label>
                {currentWorkspace.has_meta_conversions_token && !form.metaConversionsToken && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Chave salva — deixe em branco para manter
                  </div>
                )}
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.metaConversionsToken}
                  onChange={(e) => setForm({ ...form, metaConversionsToken: e.target.value })}
                  placeholder={currentWorkspace.has_meta_conversions_token ? '••••••••••••• (manter atual)' : 'Cole o token aqui para configurar'}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Usado para enviar eventos Lead e Purchase à Meta Conversions API automaticamente.
                </p>
              </div>
            </div>
          </div>

          {/* ── Integração com o Site ──────────────────────────────── */}
          <div id="site-integration" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              Integração com o Site
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              URLs para conectar o site ao catálogo de imóveis e receber leads dos formulários de contato.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Feed XML de imóveis</label>
                <p className="text-xs text-gray-400 mb-1">
                  O site consulta esta URL periodicamente para sincronizar o catálogo de imóveis disponíveis.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="input font-mono text-xs"
                    readOnly
                    value={feedUrl}
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button type="button" className="btn-ghost px-2 flex-shrink-0" onClick={() => copy(feedUrl, 'feed')} title="Copiar">
                    {copiedField === 'feed' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Feed XML para portais (Zap/OLX/VivaReal)</label>
                <p className="text-xs text-gray-400 mb-1">
                  Cole esta URL no assistente de importação por XML dos portais para anunciar automaticamente os imóveis disponíveis.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="input font-mono text-xs"
                    readOnly
                    value={portalsUrl}
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button type="button" className="btn-ghost px-2 flex-shrink-0" onClick={() => copy(portalsUrl, 'portals')} title="Copiar">
                    {copiedField === 'portals' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook de leads do site</label>
                <p className="text-xs text-gray-400 mb-1">
                  O site envia um POST para esta URL com os dados de cada lead enviado pelos formulários de contato dos imóveis.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="input font-mono text-xs"
                    readOnly
                    value={leadsUrl}
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <button type="button" className="btn-ghost px-2 flex-shrink-0" onClick={() => copy(leadsUrl, 'leads')} title="Copiar">
                    {copiedField === 'leads' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-ghost text-xs text-red-600"
                  onClick={handleRegenerateToken}
                  disabled={regeneratingToken}
                >
                  <RefreshCw className={clsx('w-3.5 h-3.5', regeneratingToken && 'animate-spin')} />
                  {regeneratingToken ? 'Gerando novo token...' : 'Gerar novo token'}
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  Gera um novo token e invalida as URLs acima — atualize a configuração no site em seguida.
                </p>
              </div>
            </div>
          </div>

          {/* ── Chaves de API dos Provedores ──────────────────────── */}
          <div id="ai-keys" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Brain className="w-4 h-4 text-indigo-500" />
              Provedores de IA — Chaves de API
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Cadastre as chaves dos provedores que deseja usar. Cada tarefa (agente, análise, textos) pode usar um provedor diferente.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              {/* Anthropic */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700">A</div>
                  <span className="text-sm font-semibold text-gray-900">Anthropic (Claude)</span>
                  {(currentWorkspace as any).has_anthropic_key && !form.anthropicApiKey && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />
                  )}
                </div>
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.anthropicApiKey}
                  onChange={(e) => setForm({ ...form, anthropicApiKey: e.target.value })}
                  placeholder={(currentWorkspace as any).has_anthropic_key ? '••••• (manter atual)' : 'sk-ant-...'}
                />
                <p className="text-[11px] text-gray-400">console.anthropic.com</p>
              </div>

              {/* OpenAI */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">G</div>
                  <span className="text-sm font-semibold text-gray-900">OpenAI (ChatGPT)</span>
                  {(currentWorkspace as any).has_openai_key && !form.openaiApiKey && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />
                  )}
                </div>
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.openaiApiKey}
                  onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
                  placeholder={(currentWorkspace as any).has_openai_key ? '••••• (manter atual)' : 'sk-...'}
                />
                <p className="text-[11px] text-gray-400">platform.openai.com</p>
              </div>

              {/* Gemini */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">G</div>
                  <span className="text-sm font-semibold text-gray-900">Google Gemini</span>
                  {(currentWorkspace as any).has_gemini_key && !form.geminiApiKey && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />
                  )}
                </div>
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.geminiApiKey}
                  onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
                  placeholder={(currentWorkspace as any).has_gemini_key ? '••••• (manter atual)' : 'AIza...'}
                />
                <p className="text-[11px] text-gray-400">aistudio.google.com</p>
              </div>
            </div>

            {/* Custom */}
            <details className="mt-3">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                Provedor personalizado (Ollama / OpenAI-compatível)
              </summary>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Base URL</label>
                  <input
                    className="input font-mono text-xs"
                    value={form.aiBaseUrl}
                    onChange={(e) => setForm({ ...form, aiBaseUrl: e.target.value })}
                    placeholder="http://servidor:11434/v1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Chave (opcional)</label>
                  <input
                    className="input font-mono text-xs"
                    type={showTokens ? 'text' : 'password'}
                    value={form.customAiApiKey}
                    onChange={(e) => setForm({ ...form, customAiApiKey: e.target.value })}
                    placeholder={(currentWorkspace as any).has_custom_ai_key ? '••••• (manter atual)' : 'Deixe vazio se não exigir'}
                  />
                </div>
              </div>
            </details>
          </div>

          {/* ── Agente de Atendimento ──────────────────────────────── */}
          <div id="ai-agent" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              Agente de Atendimento (Chatbot)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              IA que responde leads no WhatsApp, qualifica e rota para equipe.
            </p>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do agente</label>
                <input
                  className="input max-w-xs"
                  value={form.aiAgentName}
                  onChange={(e) => setForm({ ...form, aiAgentName: e.target.value })}
                  placeholder="Lia"
                  maxLength={40}
                />
              </div>

              {/* Provedor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provedor</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'anthropic', label: 'Claude (Anthropic)' },
                    { value: 'openai',    label: 'ChatGPT (OpenAI)'   },
                    { value: 'gemini',    label: 'Gemini (Google)'    },
                    { value: 'custom',    label: 'Personalizado'      },
                  ].map((opt) => (
                    <label key={opt.value} className={clsx(
                      'flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors text-xs font-medium',
                      form.aiProvider === opt.value
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    )}>
                      <input type="radio" name="aiProvider" value={opt.value}
                        checked={form.aiProvider === opt.value}
                        onChange={(e) => setForm({ ...form, aiProvider: e.target.value })}
                        className="sr-only" />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Modelo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                {form.aiProvider === 'custom' ? (
                  <input className="input" value={form.aiModel}
                    onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                    placeholder="ex: llama3.1:8b" />
                ) : (
                  <select className="input" value={form.aiModel}
                    onChange={(e) => setForm({ ...form, aiModel: e.target.value })}>
                    <option value="">Padrão automático</option>
                    {form.aiProvider === 'openai' && <>
                      <optgroup label="GPT-4o">
                        <option value="gpt-4o">gpt-4o (mais poderoso)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini (rápido e barato)</option>
                      </optgroup>
                      <optgroup label="GPT-4.1">
                        <option value="gpt-4.1">gpt-4.1</option>
                        <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                        <option value="gpt-4.1-nano">gpt-4.1-nano</option>
                      </optgroup>
                    </>}
                    {form.aiProvider === 'gemini' && <>
                      <optgroup label="Gemini 2.5">
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (mais poderoso)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (rápido)</option>
                      </optgroup>
                      <optgroup label="Gemini 2.0">
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (rápido e barato)</option>
                      </optgroup>
                      <optgroup label="Gemini 1.5">
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      </optgroup>
                    </>}
                    {form.aiProvider === 'anthropic' && <>
                      <optgroup label="Claude Sonnet">
                        <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recomendado)</option>
                      </optgroup>
                      <optgroup label="Claude Haiku (rápido)">
                        <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (rápido e barato)</option>
                      </optgroup>
                      <optgroup label="Claude Opus">
                        <option value="claude-opus-4-6">claude-opus-4-6 (mais poderoso)</option>
                      </optgroup>
                    </>}
                  </select>
                )}
              </div>

              {/* Ferramentas */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={form.aiToolsEnabled}
                    onChange={(e) => setForm({ ...form, aiToolsEnabled: e.target.checked })} />
                  <div className={clsx('w-10 h-5 rounded-full transition-colors', form.aiToolsEnabled ? 'bg-indigo-500' : 'bg-gray-200')} />
                  <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.aiToolsEnabled && 'translate-x-5')} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    {form.aiAgentName || 'Lia'} pode buscar imóveis, enviar fichas e propor visitas
                  </div>
                  <div className="text-xs text-gray-500">
                    Durante a conversa, a IA consulta o catálogo e registra propostas de visita.
                  </div>
                </div>
              </label>

              {/* Follow-up */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={form.followUpEnabled}
                    onChange={(e) => setForm({ ...form, followUpEnabled: e.target.checked })} />
                  <div className={clsx('w-10 h-5 rounded-full transition-colors', form.followUpEnabled ? 'bg-indigo-500' : 'bg-gray-200')} />
                  <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.followUpEnabled && 'translate-x-5')} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                    Follow-up automático
                  </div>
                  <div className="text-xs text-gray-500">Envia mensagens após 30 min, 1 dia e 3 dias sem resposta.</div>
                </div>
              </label>

              {/* Análise de leads */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={form.aiAnalysisEnabled}
                    onChange={(e) => setForm({ ...form, aiAnalysisEnabled: e.target.checked })} />
                  <div className={clsx('w-10 h-5 rounded-full transition-colors', form.aiAnalysisEnabled ? 'bg-indigo-500' : 'bg-gray-200')} />
                  <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.aiAnalysisEnabled && 'translate-x-5')} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Análise automática de leads</div>
                  <div className="text-xs text-gray-500">A IA lê as conversas e qualifica cada lead no funil automaticamente.</div>
                </div>
              </label>

              {form.aiAnalysisEnabled && (
                <div className="ml-13 pl-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Intervalo entre análises</label>
                  <select className="input text-sm w-48" value={form.aiAnalysisIntervalMinutes}
                    onChange={e => setForm({ ...form, aiAnalysisIntervalMinutes: parseInt(e.target.value) })}>
                    <option value={5}>A cada 5 minutos</option>
                    <option value={15}>A cada 15 minutos</option>
                    <option value={30}>A cada 30 minutos</option>
                    <option value={60}>A cada 1 hora</option>
                    <option value={120}>A cada 2 horas</option>
                    <option value={240}>A cada 4 horas</option>
                    <option value={480}>A cada 8 horas</option>
                    <option value={1440}>A cada 24 horas</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Intervalos menores consomem mais tokens.</p>
                </div>
              )}

              {/* Ignora grupos */}
              <div className="border border-gray-100 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative flex-shrink-0">
                    <input type="checkbox" className="sr-only" checked={form.aiIgnoreGroups}
                      onChange={(e) => setForm({ ...form, aiIgnoreGroups: e.target.checked })} />
                    <div className={clsx('w-10 h-5 rounded-full transition-colors', form.aiIgnoreGroups ? 'bg-indigo-500' : 'bg-gray-200')} />
                    <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.aiIgnoreGroups && 'translate-x-5')} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-gray-400" />
                      IA ignora grupos
                    </div>
                    <div className="text-xs text-gray-500">
                      Chatbot e análise não processam mensagens de grupos do WhatsApp.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* ── Armazenamento de Tickets (superadmin) ─────────────── */}
          {isSuperAdmin && (
            <div id="ticket-storage" className="card p-6 scroll-mt-4">
              <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Save className="w-4 h-4 text-gray-500" />
                Armazenamento de Tickets
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Limite de espaço em disco para arquivos anexados aos tickets deste workspace.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-xs">
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Quota máxima</label>
                  <select
                    className="input w-full"
                    value={form.ticketStorageQuotaMb}
                    onChange={e => setForm({ ...form, ticketStorageQuotaMb: parseInt(e.target.value) })}
                  >
                    <option value={512}>512 MB</option>
                    <option value={1024}>1 GB</option>
                    <option value={2048}>2 GB</option>
                    <option value={5120}>5 GB</option>
                    <option value={10240}>10 GB</option>
                    <option value={20480}>20 GB</option>
                    <option value={51200}>50 GB</option>
                  </select>
                </div>
                <p className="text-xs text-gray-400 mt-5">Visível apenas para superadmin</p>
              </div>
            </div>
          )}

          {/* ── Horário comercial ──────────────────────────────────── */}
          <div id="business-hours" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Horário Comercial
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Follow-ups só são enviados dentro deste horário.
            </p>

            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={businessHours.enabled}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                <div className={clsx(
                  'w-10 h-5 rounded-full transition-colors',
                  businessHours.enabled ? 'bg-orange-500' : 'bg-gray-200'
                )} />
                <div className={clsx(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  businessHours.enabled && 'translate-x-5'
                )} />
              </div>
              <span className="text-sm font-medium text-gray-900">
                {businessHours.enabled ? 'Ativado' : 'Desativado (envia a qualquer hora)'}
              </span>
            </label>

            {businessHours.enabled && (
              <div className="space-y-2">
                {DAY_KEYS.map(day => {
                  const conf = businessHours[day];
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={conf.enabled}
                          onChange={(e) => updateDay(day, 'enabled', e.target.checked)}
                          className="rounded border-gray-300 text-orange-500"
                        />
                        <span className={clsx(
                          'text-sm',
                          conf.enabled ? 'text-gray-900 font-medium' : 'text-gray-400'
                        )}>
                          {DAY_LABELS[day]}
                        </span>
                      </label>

                      {conf.enabled ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            className="input py-1 px-2 text-sm w-28"
                            value={conf.open}
                            onChange={(e) => updateDay(day, 'open', e.target.value)}
                          />
                          <span className="text-gray-400 text-sm">até</span>
                          <input
                            type="time"
                            className="input py-1 px-2 text-sm w-28"
                            value={conf.close}
                            onChange={(e) => updateDay(day, 'close', e.target.value)}
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Fechado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Alertas internos: SLA e leads sem retorno ──────────── */}
          <div id="alerts" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Alertas Internos
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Avisa o corretor responsável quando uma conversa estoura o prazo de resposta ou quando
              um lead fica sem retorno por muito tempo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SLA de resposta (minutos)</label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={form.slaResponseMinutes}
                  onChange={(e) => setForm({ ...form, slaResponseMinutes: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  0 desativa o alerta. Avisa o corretor quando o lead aguarda a primeira resposta há mais tempo que isso.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lead esquecido (horas)</label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={form.leadStaleHours}
                  onChange={(e) => setForm({ ...form, leadStaleHours: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  0 desativa o alerta. Avisa o corretor quando uma conversa fica sem resposta dele há mais tempo que isso.
                </p>
              </div>
            </div>
          </div>

          {/* ── Comissionamento de corretores parceiros ────────────── */}
          <div id="commission" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Percent className="w-4 h-4 text-brand-600" />
              Comissionamento
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Percentual de comissão padrão aplicado automaticamente ao registrar uma venda. Pode ser
              sobrescrito por empreendimento ou individualmente em cada venda.
            </p>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">% de comissão padrão</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="input"
                value={form.defaultCommissionPct}
                onChange={(e) => setForm({ ...form, defaultCommissionPct: e.target.value })}
                placeholder="Ex: 5"
              />
              <p className="text-xs text-gray-400 mt-1">
                Em branco = sem cálculo automático de comissão por padrão.
              </p>
            </div>
          </div>

          {/* ── White-label: domínio personalizado ─────────────────── */}
          <div id="custom-domain" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-500" />
              Domínio Personalizado (White-label)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Use o domínio da sua empresa para acessar o painel, com logomarca própria e certificado SSL gerado automaticamente.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domínio personalizado</label>
                <input
                  className="input max-w-xs font-mono text-sm"
                  value={form.customDomain}
                  onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
                  placeholder="painel.suaempresa.com.br"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Salve as alterações e siga as instruções de DNS abaixo para ativar o domínio.
                </p>
              </div>

              {currentWorkspace.custom_domain && (
                <div className="border border-gray-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Status:</span>
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', domainStatus.className)}>
                      {domainStatus.label}
                    </span>
                  </div>

                  {currentWorkspace.custom_domain_status === 'verified' ? (
                    <p className="text-sm text-green-700 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Domínio verificado e ativo, com certificado SSL renovado automaticamente.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">
                        Para comprovar que você é o responsável por este domínio, crie um registro DNS do tipo TXT:
                      </p>
                      <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1">
                        <div><span className="text-gray-400">Tipo:</span> TXT</div>
                        <div><span className="text-gray-400">Nome:</span> _gtw-verify.{currentWorkspace.custom_domain}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Valor:</span>
                          <span className="break-all">{currentWorkspace.custom_domain_verification_token}</span>
                          <button
                            type="button"
                            className="btn-ghost px-1.5 py-0.5 flex-shrink-0"
                            onClick={() => copy(currentWorkspace.custom_domain_verification_token || '', 'domain-token')}
                            title="Copiar"
                          >
                            {copiedField === 'domain-token' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Em seguida, crie um registro <strong>CNAME</strong> apontando{' '}
                        <span className="font-mono">{currentWorkspace.custom_domain}</span> para{' '}
                        <span className="font-mono">{platformDomain}</span> e clique em &quot;Verificar domínio&quot;.
                        A propagação do DNS pode levar alguns minutos a algumas horas.
                      </p>
                    </>
                  )}

                  {domainError && (
                    <p className="text-xs text-red-600">{domainError}</p>
                  )}

                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={handleVerifyDomain}
                    disabled={verifyingDomain}
                  >
                    <RefreshCw className={clsx('w-3.5 h-3.5', verifyingDomain && 'animate-spin')} />
                    {verifyingDomain ? 'Verificando...' : 'Verificar domínio'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Log de Auditoria ────────────────────────────────────── */}
          {auditLogs !== null && (
            <div id="audit-logs" className="card p-6 scroll-mt-4">
              <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Log de Auditoria
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Últimas ações sensíveis registradas neste workspace (configurações, permissões e segurança).
              </p>

              {auditLogs.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma ação registrada ainda.</p>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="px-2 py-1.5 font-medium">Quando</th>
                        <th className="px-2 py-1.5 font-medium">Ação</th>
                        <th className="px-2 py-1.5 font-medium">Usuário</th>
                        <th className="px-2 py-1.5 font-medium">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-2 py-1.5 text-gray-900">
                            {AUDIT_ACTION_LABELS[log.action] || log.action}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {log.user_name || log.user_email || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400 font-mono">
                            {log.ip_address || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── IA para Geração de Textos ──────────────────────────── */}
          <div id="ai-texts" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              IA para Geração de Textos
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Modelo usado para gerar descrições de imóveis, textos de marketing e sugestões. Independente das configurações do agente de atendimento.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provedor</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'anthropic', label: 'Claude (Anthropic)' },
                    { value: 'openai',    label: 'ChatGPT (OpenAI)'   },
                    { value: 'gemini',    label: 'Gemini (Google)'    },
                    { value: 'custom',    label: 'Personalizado'      },
                  ].map((opt) => (
                    <label key={opt.value} className={clsx(
                      'flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2 transition-colors',
                      form.descriptionAiProvider === opt.value
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    )}>
                      <input
                        type="radio"
                        name="descriptionAiProvider"
                        value={opt.value}
                        checked={form.descriptionAiProvider === opt.value}
                        onChange={(e) => setForm({ ...form, descriptionAiProvider: e.target.value })}
                        className="sr-only"
                      />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                {form.descriptionAiProvider === 'custom' ? (
                  <input
                    className="input"
                    value={form.descriptionAiModel}
                    onChange={(e) => setForm({ ...form, descriptionAiModel: e.target.value })}
                    placeholder="Nome exato do modelo (ex: llama3.2)"
                  />
                ) : (
                  <select
                    className="input"
                    value={form.descriptionAiModel}
                    onChange={(e) => setForm({ ...form, descriptionAiModel: e.target.value })}
                  >
                    <option value="">Padrão automático</option>
                    {form.descriptionAiProvider === 'openai' && <>
                      <option value="gpt-4o">GPT-4o (mais poderoso)</option>
                      <option value="gpt-4o-mini">GPT-4o mini (mais rápido)</option>
                      <option value="gpt-4.1">GPT-4.1</option>
                      <option value="gpt-4.1-mini">GPT-4.1 mini</option>
                    </>}
                    {form.descriptionAiProvider === 'gemini' && <>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro (mais poderoso)</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (equilibrado)</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (rápido)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    </>}
                    {(form.descriptionAiProvider === 'anthropic' || !form.descriptionAiProvider) && <>
                      <option value="claude-opus-4-8">Claude Opus 4.8 (mais poderoso)</option>
                      <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (balanceado)</option>
                      <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (mais rápido)</option>
                    </>}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1">Usa as chaves de API já configuradas para o provedor selecionado.</p>
              </div>
            </div>
          </div>

          {/* ── NPS pós-visita ────────────────────────────────────── */}
          <div id="nps" className="card p-6 scroll-mt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  NPS pós-visita
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Envio automático de pesquisa de satisfação após a visita ser marcada como realizada.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.npsEnabled}
                  onChange={(e) => setForm({ ...form, npsEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Ativo</span>
              </label>
            </div>

            {form.npsEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delay após visita (horas)</label>
                  <input
                    type="number" min={0} max={72}
                    className="input max-w-xs"
                    value={form.npsDelayHours}
                    onChange={(e) => setForm({ ...form, npsDelayHours: parseInt(e.target.value) || 24 })}
                  />
                  <p className="text-xs text-gray-400 mt-1">0 = enviar imediatamente após a visita ser realizada.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem personalizada (opcional)</label>
                  <textarea
                    className="input"
                    rows={4}
                    value={form.npsMessageTemplate}
                    onChange={(e) => setForm({ ...form, npsMessageTemplate: e.target.value })}
                    placeholder={`Olá! 😊\n\nObrigado pela visita ao imóvel!\n\nComo foi sua experiência? Responda com um número de 0 a 10:`}
                  />
                  <p className="text-xs text-gray-400 mt-1">Deixe em branco para usar o texto padrão do sistema.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Assinatura Eletrônica (ZapSign) ──────────────────── */}
          <div id="zapsign" className="card p-6 scroll-mt-4">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              Assinatura Eletrônica — ZapSign
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Permite enviar contratos e propostas para assinatura eletrônica diretamente pelo sistema.
              <a href="https://zapsign.com.br" target="_blank" rel="noreferrer" className="ml-1 text-brand-600 underline">Criar conta ZapSign →</a>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Token ZapSign</label>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs flex-1"
                  type="password"
                  value={form.zapsignApiToken}
                  onChange={(e) => setForm({ ...form, zapsignApiToken: e.target.value })}
                  placeholder={
                    currentWorkspace.zapsign_api_token
                      ? '••••••••••••••••••••••• (já configurado)'
                      : 'Cole seu token da API ZapSign aqui'
                  }
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Encontre em: ZapSign → Configurações → API → Token de produção.</p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">URL do Webhook (configure no ZapSign)</label>
              <div className="flex items-center gap-2">
                <input
                  className="input font-mono text-xs flex-1"
                  readOnly
                  value={`${API_URL}/zapsign/webhook`}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button type="button" className="btn-ghost px-2 flex-shrink-0"
                  onClick={() => copy(`${API_URL}/zapsign/webhook`, 'zapsign-webhook')}
                  title="Copiar">
                  {copiedField === 'zapsign-webhook' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Configure este endpoint em: ZapSign → Configurações → Webhooks → URL de notificação.</p>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            <Save className="w-4 h-4" />
            {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
          </div>{/* end content */}
        </div>{/* end flex row */}
      </div>{/* end scroll container */}
    </>
  );
}
