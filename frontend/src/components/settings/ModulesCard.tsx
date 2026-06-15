'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Blocks, Save, Check } from 'lucide-react';
import clsx from 'clsx';

interface ModuleInfo {
  key:         string;
  label:       string;
  description: string;
}

interface ModulesResponse {
  enabled:   string[];
  available: ModuleInfo[];
  presets:   Record<string, string[]>;
}

export default function ModulesCard({ orgId, workspaceId }: { orgId: string; workspaceId: string }) {
  const [data,    setData]    = useState<ModulesResponse | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<ModulesResponse>(`/orgs/${orgId}/workspaces/${workspaceId}/modules`)
      .then(({ data }) => {
        if (cancelled) return;
        setData(data);
        setEnabled(new Set(data.enabled));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, workspaceId]);

  function toggle(key: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: res } = await api.put<{ enabled: string[] }>(
        `/orgs/${orgId}/workspaces/${workspaceId}/modules`,
        { enabled: [...enabled] }
      );
      setEnabled(new Set(res.enabled));

      // Atualiza o workspace ativo para o menu refletir os módulos na hora
      const { currentWorkspace, setWorkspace } = useAuth.getState();
      if (currentWorkspace?.id === workspaceId) {
        setWorkspace({ ...currentWorkspace, enabled_modules: res.enabled });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Blocks className="w-4 h-4 text-indigo-500" />
          Módulos
        </h2>
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Blocks className="w-4 h-4 text-indigo-500" />
        Módulos
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Escolha quais módulos ficam disponíveis neste workspace. Itens desativados somem do menu para todos os usuários.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.available.map((mod) => {
          const checked = enabled.has(mod.key);
          return (
            <label
              key={mod.key}
              className={clsx(
                'flex items-start gap-2.5 border rounded-lg p-3 cursor-pointer transition-colors',
                checked ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 text-indigo-600 rounded"
                checked={checked}
                onChange={() => toggle(mod.key)}
              />
              <div>
                <div className="text-sm font-medium text-gray-900">{mod.label}</div>
                <div className="text-xs text-gray-500">{mod.description}</div>
              </div>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-primary mt-4"
      >
        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar módulos'}
      </button>
    </div>
  );
}
