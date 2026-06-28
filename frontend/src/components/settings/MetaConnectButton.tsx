'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { CheckCircle, AlertCircle, Loader2, Unplug, Wifi, RefreshCw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface PhoneNumber {
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
}

interface WabaOption {
  wabaId:       string;
  wabaName:     string;
  businessName: string;
  phoneNumbers: PhoneNumber[];
}

interface StatusData {
  connected:    boolean;
  wabaId?:      string;
  wabaName?:    string;
  phoneNumbers?: PhoneNumber[];
  tokenExpired?: boolean;
}

interface MetaConnectButtonProps {
  workspaceId: string;
  onConnected?: () => void;
}

// ── FB SDK ─────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    FB: {
      init(opts: object): void;
      login(cb: (resp: { authResponse?: { code?: string } }) => void, opts: object): void;
    };
    fbAsyncInit: () => void;
  }
}

function loadFbSdk(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById('facebook-jssdk')) { resolve(); return; }
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v19.0' });
      resolve();
    };
    const script   = document.createElement('script');
    script.id      = 'facebook-jssdk';
    script.src     = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async   = true;
    script.defer   = true;
    document.body.appendChild(script);
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MetaConnectButton({ workspaceId, onConnected }: MetaConnectButtonProps) {
  const [status, setStatus]       = useState<StatusData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [sdkReady, setSdkReady]   = useState(false);
  const [wabaOptions, setWabaOptions] = useState<{ wabas: WabaOption[]; token: string } | null>(null);
  const [error, setError]         = useState('');

  const appId    = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID;

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/workspaces/${workspaceId}/integrations/meta/status`);
      setStatus(data);
    } catch { /* silencioso */ }
  }, [workspaceId]);

  useEffect(() => {
    fetchStatus();
    if (appId) {
      loadFbSdk(appId).then(() => setSdkReady(true));
    }
  }, [appId, fetchStatus]);

  async function handleConnect() {
    if (!sdkReady || !appId) {
      setError('SDK do Facebook não carregado ou META_APP_ID não configurado.');
      return;
    }
    setError('');
    setLoading(true);

    window.FB.login(async (response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setLoading(false);
        setError('Login cancelado ou negado pelo usuário.');
        return;
      }

      try {
        const { data } = await api.post(`/workspaces/${workspaceId}/integrations/meta/connect`, { code });

        if (data.connected) {
          await fetchStatus();
          onConnected?.();
        } else if (data.needsPick && data.wabas) {
          setWabaOptions({ wabas: data.wabas, token: data._token });
        }
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'Erro ao conectar com Meta.');
      } finally {
        setLoading(false);
      }
    }, {
      config_id:                      configId,
      response_type:                  'code',
      override_default_response_type: true,
    });
  }

  async function handleSelectWaba(wabaId: string) {
    if (!wabaOptions) return;
    setLoading(true);
    setError('');
    try {
      await api.post(`/workspaces/${workspaceId}/integrations/meta/select-waba`, {
        wabaId,
        accessToken: wabaOptions.token,
      });
      setWabaOptions(null);
      await fetchStatus();
      onConnected?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Erro ao selecionar WABA.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp Business desta conta? Os templates criados não serão apagados.')) return;
    setLoading(true);
    try {
      await api.delete(`/workspaces/${workspaceId}/integrations/meta/disconnect`);
      setStatus({ connected: false });
      setWabaOptions(null);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  // ── Picker de WABAs ──────────────────────────────────────────────────────

  if (wabaOptions) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Selecione qual conta WhatsApp Business usar:</p>
        {wabaOptions.wabas.map(w => (
          <button
            key={w.wabaId}
            onClick={() => handleSelectWaba(w.wabaId)}
            disabled={loading}
            className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-brand-500 hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            <div className="font-medium text-sm text-gray-900">{w.wabaName}</div>
            <div className="text-xs text-gray-500">{w.businessName} · ID: {w.wabaId}</div>
            {w.phoneNumbers?.map(p => (
              <div key={p.display_phone_number} className="text-xs text-gray-400 mt-0.5">
                📞 {p.display_phone_number} — {p.verified_name}
              </div>
            ))}
          </button>
        ))}
        <button onClick={() => setWabaOptions(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // ── Estado: conectado ────────────────────────────────────────────────────

  if (status?.connected) {
    return (
      <div className="space-y-3">
        <div className={`flex items-start gap-3 rounded-lg p-4 ${status.tokenExpired ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
          {status.tokenExpired
            ? <AlertCircle size={18} className="text-yellow-600 mt-0.5 shrink-0" />
            : <CheckCircle  size={18} className="text-green-600 mt-0.5 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${status.tokenExpired ? 'text-yellow-800' : 'text-green-800'}`}>
              {status.tokenExpired ? 'Token expirado — reconecte a conta' : 'WhatsApp Business conectado'}
            </p>
            {status.wabaName && <p className="text-xs text-gray-600 mt-0.5">{status.wabaName}</p>}
            {status.wabaId    && <p className="text-xs text-gray-400 font-mono">WABA: {status.wabaId}</p>}
            {status.phoneNumbers?.map(p => (
              <p key={p.display_phone_number} className="text-xs text-gray-500 mt-0.5">
                {p.display_phone_number} — {p.verified_name}
              </p>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {status.tokenExpired && (
            <button
              onClick={handleConnect}
              disabled={loading || !sdkReady}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Reconectar
            </button>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Verificar
          </button>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Unplug size={14} />
            Desconectar
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // ── Estado: desconectado ─────────────────────────────────────────────────

  if (!appId) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <AlertCircle size={16} />
        Integração Meta não configurada no servidor. Configure META_APP_ID e META_APP_SECRET no ambiente.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleConnect}
        disabled={loading || !sdkReady}
        className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#166FE5] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading
          ? <Loader2 size={16} className="animate-spin" />
          : <Wifi size={16} />
        }
        {loading ? 'Conectando...' : 'Conectar WhatsApp Business com Meta'}
      </button>
      {!sdkReady && <p className="text-xs text-gray-400">Carregando SDK do Facebook...</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-gray-400">
        Você será redirecionado para o login do Facebook para autorizar o acesso à sua conta WhatsApp Business.
      </p>
    </div>
  );
}
