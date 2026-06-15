'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import ConstructionTimeline from '@/components/properties/ConstructionTimeline';
import api from '@/lib/api';
import type { Development } from '@/types';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function ConstructionSchedulePage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();
  const { developmentId } = useParams<{ developmentId: string }>();

  const [development, setDevelopment] = useState<Development | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/developments/${developmentId}`);
      setDevelopment(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, developmentId]);

  useEffect(() => { load(); }, [load]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Cronograma de obra" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Cronograma de obra" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </>
    );
  }

  if (!development) {
    return (
      <>
        <Header title="Cronograma de obra" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Empreendimento não encontrado
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`Cronograma de obra · ${development.name}`}
        actions={
          <button className="btn-secondary text-sm" onClick={() => router.push(`/dashboard/developments/${development.id}`)}>
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <ConstructionTimeline workspaceId={currentWorkspace.id} developmentId={development.id} />
        </div>
      </div>
    </>
  );
}
