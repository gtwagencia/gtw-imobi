'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import PropertyForm from '@/components/properties/PropertyForm';
import type { Property } from '@/types';
import { ArrowLeft } from 'lucide-react';

export default function NewPropertyPage() {
  const { currentOrg, currentWorkspace } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const developmentId = searchParams.get('developmentId') || undefined;

  if (!currentOrg || !currentWorkspace) {
    return (
      <>
        <Header title="Novo imóvel" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Novo imóvel"
        actions={
          <button className="btn-secondary text-sm" onClick={() => router.push('/dashboard/properties')}>
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <PropertyForm
            workspaceId={currentWorkspace.id}
            orgId={currentOrg.id}
            initialDevelopmentId={developmentId}
            onSave={(created: Property) => router.push(`/dashboard/properties/${created.id}`)}
          />
        </div>
      </div>
    </>
  );
}
