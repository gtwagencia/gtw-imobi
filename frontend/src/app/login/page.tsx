'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { Home } from 'lucide-react';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router   = useRouter();
  const { login, register, verifyTwoFactor } = useAuth();

  const [mode,     setMode]     = useState<Mode>('login');
  const [name,     setName]     = useState('');
  const [orgName,  setOrgName]  = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // ── Verificação em duas etapas (2FA) ──────────────────────
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode,      setTwoFactorCode]      = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result.twoFactorRequired) {
          setTwoFactorChallenge(result.challenge);
          return;
        }
      } else {
        await register(name, email, password, orgName || undefined);
      }
      router.replace('/select');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Erro ao autenticar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactorSubmit(e: FormEvent) {
    e.preventDefault();
    if (!twoFactorChallenge) return;
    setError('');
    setLoading(true);
    try {
      await verifyTwoFactor(twoFactorChallenge, twoFactorCode.trim());
      router.replace('/select');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Código inválido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-ink-950">
      {/* Glow decorativo */}
      <div className="absolute -top-32 -left-24 w-96 h-96 bg-brand-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl mb-4 shadow-glow">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-white tracking-tight">
            Imobi<span className="text-brand-300">360</span>
          </h1>
          <p className="text-brand-200 text-sm mt-1">Atendimento & CRM inteligente para o mercado imobiliário</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {twoFactorChallenge ? (
            <>
              <h2 className="font-display text-xl font-semibold text-gray-900 mb-2">
                Verificação em duas etapas
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Digite o código gerado pelo seu aplicativo autenticador (ou um código de backup).
              </p>

              <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                  <input
                    className="input text-center text-lg tracking-widest"
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={10}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? 'Verificando...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  className="text-center w-full text-sm text-gray-500 hover:underline"
                  onClick={() => { setTwoFactorChallenge(null); setTwoFactorCode(''); setError(''); }}
                >
                  Voltar
                </button>
              </form>
            </>
          ) : (
          <>
          <h2 className="font-display text-xl font-semibold text-gray-900 mb-6">
            {mode === 'login' ? 'Entrar na sua conta' : 'Criar conta'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seu nome
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="João Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome da agência / empresa
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Minha Agência"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                className="input"
                type="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {mode === 'login' ? (
              <>Não tem conta?{' '}
                <button onClick={() => setMode('register')} className="text-brand-600 font-medium hover:underline">
                  Cadastre-se
                </button>
              </>
            ) : (
              <>Já tem conta?{' '}
                <button onClick={() => setMode('login')} className="text-brand-600 font-medium hover:underline">
                  Entrar
                </button>
              </>
            )}
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
