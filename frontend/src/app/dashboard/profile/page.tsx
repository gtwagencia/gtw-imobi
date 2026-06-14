'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { User, Lock, Save, Eye, EyeOff, CheckCircle, AlertCircle, Calendar, Unlink, Mail, Send } from 'lucide-react';

type GcalStatus  = { connected: boolean; googleEmail: string | null; configured: boolean };
type MailStatus  = { configured: boolean; host: string | null; from: string | null; user: string | null };

type AlertType = { type: 'success' | 'error'; msg: string } | null;

export default function ProfilePage() {
  const { user, fetchMe } = useAuth();

  // ── Profile form ───────────────────────────────────────
  const [name,         setName]         = useState(user?.name || '');
  const [avatarUrl,    setAvatarUrl]    = useState(user?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileAlert,  setProfileAlert]  = useState<AlertType>(null);

  // ── Google Calendar ────────────────────────────────────
  const [gcalStatus,    setGcalStatus]    = useState<GcalStatus | null>(null);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalDisconnecting, setGcalDisconnecting] = useState(false);

  const loadGcalStatus = useCallback(async () => {
    try {
      const { data } = await api.get<GcalStatus>('/integrations/google/status');
      setGcalStatus(data);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => { loadGcalStatus(); }, [loadGcalStatus]);

  async function handleGcalConnect() {
    setGcalConnecting(true);
    try {
      const { data } = await api.get<{ url: string }>('/integrations/google/connect');
      const popup = window.open(data.url, 'google-oauth', 'width=520,height=620,left=200,top=100');

      const onMessage = (e: MessageEvent) => {
        if (e.data === 'google_calendar_connected') {
          loadGcalStatus();
          popup?.close();
        } else if (e.data === 'google_calendar_error') {
          popup?.close();
        }
        window.removeEventListener('message', onMessage);
        setGcalConnecting(false);
      };
      window.addEventListener('message', onMessage);

      // Fallback: se o popup fechar sem postMessage
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          window.removeEventListener('message', onMessage);
          loadGcalStatus();
          setGcalConnecting(false);
        }
      }, 500);
    } catch {
      setGcalConnecting(false);
    }
  }

  async function handleGcalDisconnect() {
    if (!confirm('Desconectar o Google Calendar? Os eventos já criados no Google não serão removidos.')) return;
    setGcalDisconnecting(true);
    try {
      await api.delete('/integrations/google/disconnect');
      setGcalStatus(s => s ? { ...s, connected: false, googleEmail: null } : s);
    } finally {
      setGcalDisconnecting(false);
    }
  }

  // ── Mail test ─────────────────────────────────────────
  const [mailStatus,  setMailStatus]  = useState<MailStatus | null>(null);
  const [mailTesting, setMailTesting] = useState(false);
  const [mailResult,  setMailResult]  = useState<{ ok: boolean; message?: string; error?: string; hint?: string } | null>(null);

  useEffect(() => {
    api.get<MailStatus>('/integrations/mail/status')
      .then(r => setMailStatus(r.data))
      .catch(() => {});
  }, []);

  async function handleTestMail() {
    setMailTesting(true);
    setMailResult(null);
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>('/integrations/mail/test');
      setMailResult(data);
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { ok: boolean; error?: string; hint?: string } } })?.response?.data;
      setMailResult(d ?? { ok: false, error: 'Erro ao conectar com o servidor.' });
    } finally {
      setMailTesting(false);
    }
  }

  // ── Password form ──────────────────────────────────────
  const [currentPwd,  setCurrentPwd]  = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [showPwds,    setShowPwds]    = useState(false);
  const [savingPwd,   setSavingPwd]   = useState(false);
  const [pwdAlert,    setPwdAlert]    = useState<AlertType>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileAlert(null);
    setSavingProfile(true);
    try {
      await api.put('/auth/me/profile', { name, avatarUrl: avatarUrl || null });
      await fetchMe();
      setProfileAlert({ type: 'success', msg: 'Perfil atualizado com sucesso!' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Erro ao atualizar perfil';
      setProfileAlert({ type: 'error', msg });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdAlert(null);
    if (newPwd !== confirmPwd) {
      setPwdAlert({ type: 'error', msg: 'As senhas não coincidem' });
      return;
    }
    if (newPwd.length < 8) {
      setPwdAlert({ type: 'error', msg: 'A nova senha deve ter ao menos 8 caracteres' });
      return;
    }
    setSavingPwd(true);
    try {
      await api.put('/auth/me/password', { currentPassword: currentPwd, newPassword: newPwd });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      setPwdAlert({ type: 'success', msg: 'Senha alterada com sucesso!' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Erro ao alterar senha';
      setPwdAlert({ type: 'error', msg });
    } finally {
      setSavingPwd(false);
    }
  }

  function Alert({ alert }: { alert: AlertType }) {
    if (!alert) return null;
    return (
      <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
        alert.type === 'success'
          ? 'bg-green-50 border border-green-200 text-green-700'
          : 'bg-red-50 border border-red-200 text-red-700'
      }`}>
        {alert.type === 'success'
          ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
          : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
        {alert.msg}
      </div>
    );
  }

  return (
    <>
      <Header title="Meu Perfil" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-xl space-y-6">

          {/* ── Avatar + Info ───────────────────────────────────── */}
          <div className="card p-6">
            <div className="flex items-center gap-5 mb-6">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover border-2 border-brand-100"
                  onError={() => setAvatarUrl('')}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center
                                text-white text-3xl font-bold flex-shrink-0">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{user?.name}</h2>
                <p className="text-sm text-gray-400">{user?.email}</p>
                {user?.is_super_admin && (
                  <span className="badge-blue text-xs mt-1">Super Admin</span>
                )}
              </div>
            </div>

            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              Informações pessoais
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  className="input bg-gray-50 text-gray-400 cursor-not-allowed"
                  value={user?.email || ''}
                  disabled
                />
                <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL do avatar</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://exemplo.com/foto.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>

              <Alert alert={profileAlert} />

              <button type="submit" className="btn-primary" disabled={savingProfile}>
                <Save className="w-4 h-4" />
                {savingProfile ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </form>
          </div>

          {/* ── Change Password ─────────────────────────────────── */}
          <div className="card p-6">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              Alterar senha
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPwds ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwds(!showPwds)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPwds ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <input
                  className="input"
                  type={showPwds ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                <input
                  className="input"
                  type={showPwds ? 'text' : 'password'}
                  placeholder="Repita a nova senha"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                />
              </div>

              <Alert alert={pwdAlert} />

              <button type="submit" className="btn-primary" disabled={savingPwd}>
                <Lock className="w-4 h-4" />
                {savingPwd ? 'Alterando...' : 'Alterar senha'}
              </button>
            </form>
          </div>

          {/* ── Google Calendar ─────────────────────────────────── */}
          {gcalStatus && (
            <div className="card p-6">
              <h3 className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                Google Calendar
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Tickets com prazo atribuídos a você serão sincronizados automaticamente.
              </p>

              {!gcalStatus.configured ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  Integração com Google não configurada no servidor. Contate o administrador.
                </p>
              ) : gcalStatus.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-700">Conectado</p>
                      {gcalStatus.googleEmail && (
                        <p className="text-xs text-green-600 truncate">{gcalStatus.googleEmail}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleGcalDisconnect}
                    disabled={gcalDisconnecting}
                    className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Unlink className="w-4 h-4" />
                    {gcalDisconnecting ? 'Desconectando...' : 'Desconectar'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGcalConnect}
                  disabled={gcalConnecting}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  {/* Google color icon */}
                  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {gcalConnecting ? 'Aguardando autorização...' : 'Conectar Google Calendar'}
                </button>
              )}
            </div>
          )}

          {/* ── E-mail (teste) ──────────────────────────────────── */}
          {mailStatus && (
            <div className="card p-6">
              <h3 className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                Notificações por E-mail
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Tickets atribuídos, comentários e mudanças de prazo geram e-mails automáticos.
              </p>

              {!mailStatus.configured ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  SMTP não configurado no servidor. Defina as variáveis <code className="font-mono text-xs">SMTP_HOST</code>, <code className="font-mono text-xs">SMTP_USER</code> e <code className="font-mono text-xs">SMTP_PASS</code>.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                    {mailStatus.host && <p>Servidor: <span className="font-mono text-gray-700">{mailStatus.host}</span></p>}
                    {mailStatus.user && <p>Conta: <span className="font-mono text-gray-700">{mailStatus.user}</span></p>}
                    {mailStatus.from && <p>Remetente: <span className="font-mono text-gray-700">{mailStatus.from}</span></p>}
                  </div>

                  <button
                    onClick={handleTestMail}
                    disabled={mailTesting}
                    className="btn-secondary text-sm flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {mailTesting ? 'Enviando...' : `Enviar e-mail de teste para ${user?.email}`}
                  </button>

                  {mailResult && (
                    <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
                      mailResult.ok
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}>
                      {mailResult.ok
                        ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <div>
                        <p className="font-medium">{mailResult.ok ? mailResult.message : mailResult.error}</p>
                        {!mailResult.ok && mailResult.hint && (
                          <p className="text-xs mt-1 opacity-80">{mailResult.hint}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Orgs ────────────────────────────────────────────── */}
          <div className="card p-6">
            <h3 className="font-medium text-gray-900 mb-4">Suas organizações</h3>
            <div className="space-y-2">
              {user?.orgs.map((org) => (
                <div key={org.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center
                                  text-brand-700 text-sm font-bold flex-shrink-0">
                    {org.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{org.name}</div>
                    <div className="text-xs text-gray-400 capitalize">{org.role} · {org.plan}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
