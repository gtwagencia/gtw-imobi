'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Home, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';

function NovaSenhaForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token');

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  useEffect(() => {
    if (!token) setError('Link inválido. Solicite uma nova recuperação de senha.');
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('As senhas não coincidem'); return; }
    if (password.length < 8)  { setError('A senha deve ter pelo menos 8 caracteres'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Link inválido ou expirado. Solicite uma nova recuperação.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-ink-950">
      <div className="absolute -top-32 -left-24 w-96 h-96 bg-brand-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl mb-4 shadow-glow">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-white tracking-tight">
            Imobi<span className="text-brand-300">360</span>
          </h1>
        </div>

        <div className="card p-8">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
              <h2 className="font-display text-xl font-semibold text-gray-900 mb-2">Senha redefinida!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Sua senha foi atualizada com sucesso. Faça login com a nova senha.
              </p>
              <button className="btn-primary w-full" onClick={() => router.replace('/login')}>
                Ir para o login
              </button>
            </div>
          ) : !token ? (
            <div className="text-center py-4">
              <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
              <h2 className="font-display text-xl font-semibold text-gray-900 mb-2">Link inválido</h2>
              <p className="text-sm text-gray-500 mb-6">
                Este link de recuperação é inválido ou expirou. Solicite um novo.
              </p>
              <button className="btn-primary w-full" onClick={() => router.replace('/login')}>
                Voltar ao login
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-gray-900 mb-2">
                Criar nova senha
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Escolha uma senha forte com pelo menos 8 caracteres.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPwd(v => !v)}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                  <input
                    className="input"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={loading || !token}>
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NovaSenhaPage() {
  return (
    <Suspense>
      <NovaSenhaForm />
    </Suspense>
  );
}
