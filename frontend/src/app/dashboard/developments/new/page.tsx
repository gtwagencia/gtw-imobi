'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import DevelopmentForm from '@/components/properties/DevelopmentForm';
import type { Development } from '@/types';
import { ArrowLeft } from 'lucide-react';

export default function NewDevelopmentPage() {
  const { currentWorkspace } = useAuth();
  const router = useRouter();

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Novo empreendimento" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Novo empreendimento"
        actions={
          <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/developments')}>
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <DevelopmentForm
            workspaceId={currentWorkspace.id}
            onSave={(created: Development) => router.push(`/dashboard/developments/${created.id}`)}
          />
        </div>
      </div>
    </>
  );
}
