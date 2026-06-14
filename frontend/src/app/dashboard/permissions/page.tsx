'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { PermissionProfile, PermissionModuleKey } from '@/types';
import { Lock, Loader2 } from 'lucide-react';

const PERMISSION_MODULES: { key: PermissionModuleKey; label: string }[] = [
  { key: 'conversations', label: 'Conversas' },
  { key: 'contacts',      label: 'Contatos' },
  { key: 'properties',    label: 'Imóveis' },
  { key: 'kanban',        label: 'Funil' },
  { key: 'broadcasts',    label: 'Broadcasts' },
  { key: 'inboxes',       label: 'Inboxes' },
  { key: 'departments',   label: 'Departamentos' },
  { key: 'canned',        label: 'Respostas Prontas' },
  { key: 'labels',        label: 'Etiquetas' },
  { key: 'reports',       label: 'Relatórios' },
];

export default function PermissionsPage() {
  const { user, currentOrg, currentWorkspace } = useAuth();
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Mesma regra usada na Sidebar para definir quem é "admin".
  const isAdmin = user?.is_super_admin
    || currentOrg?.role === 'owner'
    || currentOrg?.role === 'admin'
    || currentWorkspace?.role === 'admin'
    || currentWorkspace?.role === undefined;

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/permission-profiles`);
      setProfiles(data.profiles);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function toggle(profile: PermissionProfile, moduleKey: PermissionModuleKey) {
    if (!currentWorkspace || profile.is_system) return;
    const next = !profile.permissions[moduleKey];
    const cellKey = `${profile.id}:${moduleKey}`;

    setSavingKey(cellKey);
    setProfiles(prev => prev.map(p => p.id === profile.id
      ? { ...p, permissions: { ...p.permissions, [moduleKey]: next } }
      : p
    ));

    try {
      await api.put(`/workspaces/${currentWorkspace.id}/permission-profiles/${profile.id}`, {
        permissions: { [moduleKey]: next },
      });
    } catch {
      setProfiles(prev => prev.map(p => p.id === profile.id
        ? { ...p, permissions: { ...p.permissions, [moduleKey]: !next } }
        : p
      ));
    } finally {
      setSavingKey(null);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Permissões" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <Header title="Permissões" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Sem permissão para acessar esta página.
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Permissões" />

      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-gray-500 mb-4 max-w-2xl">
          Defina quais módulos do menu cada tipo de usuário pode acessar. Os perfis
          marcados com <Lock className="w-3 h-3 inline-block" /> são fixos e não
          podem ser alterados.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left font-medium text-gray-500 px-4 py-3 sticky left-0 bg-white">
                    Módulo
                  </th>
                  {profiles.map(p => (
                    <th key={p.id} className="text-center font-medium text-gray-500 px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {p.name}
                        {p.is_system && <Lock className="w-3 h-3 text-gray-300" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MODULES.map(mod => (
                  <tr key={mod.key} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 sticky left-0 bg-white">
                      {mod.label}
                    </td>
                    {profiles.map(p => (
                      <td key={p.id} className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
                          checked={!!p.permissions[mod.key]}
                          disabled={p.is_system || savingKey === `${p.id}:${mod.key}`}
                          onChange={() => toggle(p, mod.key)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
