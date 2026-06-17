'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Building2, Loader2, Check, Mail, Lock, User, LogIn, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/store/auth';
import clsx from 'clsx';

type Mode = 'register' | 'login';

interface InvitationInfo {
  org_name: string;
  inviter_name: string;
  role: string;
  email: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner:  'Owner',
  admin:  'Administrador',
  member: 'Membro',
};

export default function InvitePage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { user, fetchMe } = useAuth();
  const token = searchParams.get('token') || '';

  const [info,    setInfo]    = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [mode,    setMode]    = useState<Mode>('register');
  const [done,    setDone]    = useState(false);

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token) { setError('Token de convite ausente.'); setLoading(false); return; }
    api.get(`/orgs/invitations/${token}`)
      .then(({ data }) => {
        setInfo(data);
        setForm(f => ({ ...f, email: data.email }));
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Convite inválido ou expirado.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAcceptLoggedIn() {
    setSaving(true); setFormError('');
    try {
      await api.post(`/orgs/invitations/${token}/accept`);
      await fetchMe();
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao aceitar convite');
    } finally { setSaving(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const { data } = await api.post(`/auth/invitations/${token}/register`, form);
      useAuth.setState({
        user: data.user, accessToken: data.accessToken, csrfToken: data.csrfToken,
        currentOrg: data.user?.orgs?.[0] || null, _sessionChecked: true,
      });
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao criar conta');
    } finally { setSaving(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const { data } = await api.post('/auth/login', { email: form.email, password: form.password });
      if (data.twoFactorRequired) {
        setFormError('Conta com verificação em duas etapas. Faça login normalmente e volte aqui.');
        setSaving(false); return;
      }
      useAuth.setState({
        user: data.user, accessToken: data.accessToken, csrfToken: data.csrfToken,
        currentOrg: data.user?.orgs?.[0] || null, _sessionChecked: true,
      });
      // Aceita o convite após login
      await api.post(`/orgs/invitations/${token}/accept`);
      await fetchMe();
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'E-mail ou senha incorretos');
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-8 w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Convite inválido</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-8 w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Convite aceito!</h1>
          <p className="text-gray-500 text-sm">Redirecionando para o painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-soft border border-gray-100 w-full max-w-md">

        {/* Header */}
        <div className="p-8 pb-0 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Imobi<span className="text-brand-600">360</span></h1>
          <p className="text-sm text-gray-500 mt-1">Você foi convidado</p>
        </div>

        {/* Invitation info */}
        <div className="mx-6 mt-6 p-4 bg-brand-50 border border-brand-100 rounded-xl">
          <p className="text-sm text-gray-700">
            <strong>{info?.inviter_name}</strong> convidou você para <strong>{info?.org_name}</strong>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Papel: <strong>{ROLE_LABELS[info?.role || ''] || info?.role}</strong>
          </p>
        </div>

        {/* Se já está logado */}
        {user ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-600 mb-4">
              Você está logado como <strong>{user.name}</strong>. Deseja aceitar o convite?
            </p>
            {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}
            <button onClick={handleAcceptLoggedIn} className="btn-primary w-full" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Aceitar convite
            </button>
          </div>
        ) : (
          <div className="p-6">
            {/* Tabs */}
            <div className="flex border border-gray-200 rounded-xl p-1 mb-5">
              {([
                { key: 'register', label: 'Criar conta',  Icon: UserPlus },
                { key: 'login',    label: 'Já tenho conta', Icon: LogIn   },
              ] as { key: Mode; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all',
                    mode === key ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>

            {mode === 'register' ? (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" placeholder="Seu nome completo" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" type="email" placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" type="password" placeholder="Crie uma senha (mín. 8 caracteres)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
                </div>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <button type="submit" className="btn-primary w-full" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Criar conta e aceitar convite
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" type="email" placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" type="password" placeholder="Sua senha" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
                </div>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <button type="submit" className="btn-primary w-full" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  Entrar e aceitar convite
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
