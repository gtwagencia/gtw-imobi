'use client';

import { useState, useEffect, useCallback } from 'react';
import api, { API_URL } from '@/lib/api';
import { CheckCircle, AlertCircle, Copy, Check, RefreshCw, Loader2, Save } from 'lucide-react';
import clsx from 'clsx';

// ── Types ──────────────────────────────────────────────────────────────────

interface PraediumConfig {
  enabled: boolean;
  client_code: string | null;
  connection_slug: string | null;
  observation_field_slug: string | null;
  qualified_lead_stage: string;
  inbound_enabled: boolean;
  proactive_inbox_id: string | null;
  proactive_template_name: string | null;
  has_access_token: boolean;
  inbound_token_preview: string | null;
  last_sent_at: string | null;
  last_send_error: string | null;
  last_received_at: string | null;
  last_receive_error: string | null;
}

interface Inbox {
  id: string;
  name: string;
  channel_type: string;
}

interface Template {
  name: string;
  status: string;
  language: string;
}

interface PraediumIntegrationCardProps {
  workspaceId: string;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PraediumIntegrationCard({ workspaceId }: PraediumIntegrationCardProps) {
  const [cfg, setCfg]         = useState<PraediumConfig | null>(null);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState('');

  const [form, setForm] = useState({
    enabled: false,
    clientCode: '',
    connectionSlug: '',
    accessToken: '',
    observationFieldSlug: '',
    qualifiedLeadStage: 'qualified_lead',
    inboundEnabled: false,
    proactiveInboxId: '',
    proactiveTemplateName: '',
  });

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await api.get<PraediumConfig>(`/workspaces/${workspaceId}/integrations/praedium`);
      setCfg(data);
      if (data) {
        setForm(f => ({
          ...f,
          enabled: data.enabled,
          clientCode: data.client_code || '',
          connectionSlug: data.connection_slug || '',
          observationFieldSlug: data.observation_field_slug || '',
          qualifiedLeadStage: data.qualified_lead_stage || 'qualified_lead',
          inboundEnabled: data.inbound_enabled,
          proactiveInboxId: data.proactive_inbox_id || '',
          proactiveTemplateName: data.proactive_template_name || '',
        }));
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => {
    fetchConfig();
    api.get<Inbox[]>(`/workspaces/${workspaceId}/inboxes`)
      .then(({ data }) => setInboxes(data.filter(i => i.channel_type === 'whatsapp_official')))
      .catch(() => {});
  }, [workspaceId, fetchConfig]);

  useEffect(() => {
    if (!form.proactiveInboxId) { setTemplates([]); return; }
    api.get<Template[]>(`/workspaces/${workspaceId}/broadcasts/templates/${form.proactiveInboxId}`)
      .then(({ data }) => setTemplates(data))
      .catch(() => setTemplates([]));
  }, [workspaceId, form.proactiveInboxId]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.accessToken) delete payload.accessToken;
      if (!payload.proactiveInboxId) payload.proactiveInboxId = null;
      const { data } = await api.put(`/workspaces/${workspaceId}/integrations/praedium`, payload);
      setCfg(data);
      setForm(f => ({ ...f, accessToken: '' }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateToken() {
    if (!confirm('Gerar um novo token de recebimento? A URL/token atual configurados no painel do Praedium vão parar de funcionar.')) return;
    setRegenerating(true);
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/integrations/praedium/regenerate-token`);
      setCfg(data);
    } finally {
      setRegenerating(false);
    }
  }

  async function copyWebhookUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div id="praedium" className="card p-6 scroll-mt-4">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }

  const webhookUrl = `${API_URL}/webhooks/praedium/${workspaceId}`;

  return (
    <div id="praedium" className="card p-6 scroll-mt-4">
      <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
        Praedium — Central de Conexões
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Quando ativa, a IA passa a pré-qualificar os leads pelo WhatsApp e enviá-los ao Praedium (com o imóvel ofertado e o
        resumo do atendimento) em vez de rotear para um corretor interno — a gestão do funil segue lá.
      </p>

      {/* Ativar */}
      <label className="flex items-center gap-3 cursor-pointer mb-5">
        <div className="relative flex-shrink-0">
          <input type="checkbox" className="sr-only" checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          <div className={clsx('w-10 h-5 rounded-full transition-colors', form.enabled ? 'bg-indigo-500' : 'bg-gray-200')} />
          <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.enabled && 'translate-x-5')} />
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900">Ativar integração com o Praedium</div>
          <div className="text-xs text-gray-500">O atendimento passa a ser gerenciado no Praedium, não no Imobi360.</div>
        </div>
      </label>

      {/* Envio de leads */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Envio de leads (Recebimento de Leads do Praedium)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Código da conta</label>
            <input className="input font-mono text-xs" value={form.clientCode}
              onChange={(e) => setForm({ ...form, clientCode: e.target.value })} placeholder="102026" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nome da conexão</label>
            <input className="input font-mono text-xs" value={form.connectionSlug}
              onChange={(e) => setForm({ ...form, connectionSlug: e.target.value })} placeholder="imobi360" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1 flex items-center gap-1.5">
              Token de acesso
              {cfg?.has_access_token && !form.accessToken && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
            </label>
            <input className="input font-mono text-xs" type="password" value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              placeholder={cfg?.has_access_token ? '••••• (manter atual)' : 'token gerado pelo Praedium'} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Campo personalizado para o resumo</label>
            <input className="input font-mono text-xs" value={form.observationFieldSlug}
              onChange={(e) => setForm({ ...form, observationFieldSlug: e.target.value })} placeholder="resumo-imobi360" />
            <p className="text-[11px] text-gray-400 mt-1">
              O Praedium não tem um campo nativo de observação — crie um campo personalizado do tipo &quot;Texto Grande&quot; no
              painel do Praedium e informe aqui o mesmo slug, para mapeá-lo na conexão.
            </p>
          </div>
        </div>
        {cfg?.last_sent_at && (
          <p className={clsx('text-xs flex items-center gap-1.5', cfg.last_send_error ? 'text-red-600' : 'text-gray-500')}>
            {cfg.last_send_error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
            Último envio: {formatDate(cfg.last_sent_at)}{cfg.last_send_error ? ` — ${cfg.last_send_error}` : ''}
          </p>
        )}
      </div>

      {/* Recebimento de eventos */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative flex-shrink-0">
            <input type="checkbox" className="sr-only" checked={form.inboundEnabled}
              onChange={(e) => setForm({ ...form, inboundEnabled: e.target.checked })} />
            <div className={clsx('w-10 h-5 rounded-full transition-colors', form.inboundEnabled ? 'bg-indigo-500' : 'bg-gray-200')} />
            <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.inboundEnabled && 'translate-x-5')} />
          </div>
          <div className="text-sm font-medium text-gray-900">Receber eventos do Praedium (Envio de dados)</div>
        </label>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">URL do webhook (configure em &quot;Envio de dados&quot; no Praedium)</label>
          <div className="flex items-center gap-2">
            <input className="input font-mono text-xs" readOnly value={webhookUrl} onClick={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-ghost px-2 flex-shrink-0" onClick={copyWebhookUrl} title="Copiar">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Token Bearer (use em Authorization: Bearer …)</label>
          <div className="flex items-center gap-2">
            <input className="input font-mono text-xs" readOnly value={cfg?.inbound_token_preview || '—'} />
            <button type="button" className="btn-ghost px-2 flex-shrink-0 text-xs text-red-600" onClick={handleRegenerateToken} disabled={regenerating}>
              <RefreshCw className={clsx('w-3.5 h-3.5', regenerating && 'animate-spin')} />
              Gerar novo
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Inbox para iniciar a qualificação</label>
            <select className="input text-xs" value={form.proactiveInboxId}
              onChange={(e) => setForm({ ...form, proactiveInboxId: e.target.value, proactiveTemplateName: '' })}>
              <option value="">Selecione uma inbox WABA</option>
              {inboxes.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Template de abertura</label>
            <select className="input text-xs" value={form.proactiveTemplateName}
              onChange={(e) => setForm({ ...form, proactiveTemplateName: e.target.value })}
              disabled={!form.proactiveInboxId}>
              <option value="">Selecione um template</option>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-gray-400">
          Quando um lead novo chegar do Praedium, o Imobi360 dispara esse template pelo WhatsApp para iniciar a qualificação.
        </p>
        {cfg?.last_received_at && (
          <p className={clsx('text-xs flex items-center gap-1.5', cfg.last_receive_error ? 'text-red-600' : 'text-gray-500')}>
            {cfg.last_receive_error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
            Último recebimento: {formatDate(cfg.last_received_at)}{cfg.last_receive_error ? ` — ${cfg.last_receive_error}` : ''}
          </p>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Salvo!' : 'Salvar integração Praedium'}
      </button>
    </div>
  );
}
