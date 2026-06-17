'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  MessageSquare, Users, TrendingUp, Building2,
  ArrowRight, CalendarCheck, Kanban, ChevronRight,
  Sparkles, Zap,
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';

interface Stats {
  openConversations: number;
  totalContacts:     number;
  pendingDeals:      number;
  activeProperties:  number;
}

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function DashboardPage() {
  const { currentWorkspace, user } = useAuth();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const isConstrutora = currentWorkspace?.business_model === 'construtora';
  const firstName     = user?.name?.split(' ')[0] ?? '';

  useEffect(() => {
    if (!currentWorkspace) { setLoading(false); return; }

    async function fetchStats() {
      try {
        const requests: Promise<{ data: { total?: number; length?: number } }>[] = [
          api.get(`/workspaces/${currentWorkspace!.id}/conversations?limit=1`),
          api.get(`/workspaces/${currentWorkspace!.id}/contacts?limit=1`),
          api.get(`/workspaces/${currentWorkspace!.id}/kanban/deals`),
        ];

        const propsEnabled = currentWorkspace!.enabled_modules?.includes('properties')
          || currentWorkspace!.enabled_modules?.includes('developments');

        if (propsEnabled) {
          requests.push(api.get(`/workspaces/${currentWorkspace!.id}/properties?limit=1`));
        }

        const results = await Promise.allSettled(requests);

        const get = (i: number): number => {
          const r = results[i];
          if (r.status !== 'fulfilled') return 0;
          return r.value.data.total ?? (Array.isArray(r.value.data) ? r.value.data.length : 0);
        };

        setStats({
          openConversations: get(0),
          totalContacts:     get(1),
          pendingDeals:      get(2),
          activeProperties:  propsEnabled ? get(3) : -1,
        });
      } catch {
        setStats({ openConversations: 0, totalContacts: 0, pendingDeals: 0, activeProperties: 0 });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [currentWorkspace]);

  if (!currentWorkspace) return null;

  const statCards = [
    {
      label:    'Conversas abertas',
      value:    stats?.openConversations,
      icon:     MessageSquare,
      gradient: 'from-blue-500 to-blue-600',
      bg:       'bg-blue-50',
      text:     'text-blue-600',
      href:     '/dashboard/conversations',
    },
    {
      label:    'Contatos na base',
      value:    stats?.totalContacts,
      icon:     Users,
      gradient: 'from-violet-500 to-violet-600',
      bg:       'bg-violet-50',
      text:     'text-violet-600',
      href:     '/dashboard/contacts',
    },
    {
      label:    isConstrutora ? 'Leads no funil' : 'Deals no funil',
      value:    stats?.pendingDeals,
      icon:     TrendingUp,
      gradient: 'from-emerald-500 to-emerald-600',
      bg:       'bg-emerald-50',
      text:     'text-emerald-600',
      href:     '/dashboard/kanban',
    },
    ...(stats?.activeProperties !== undefined && stats.activeProperties >= 0 ? [{
      label:    isConstrutora ? 'Empreendimentos' : 'Imóveis cadastrados',
      value:    stats.activeProperties,
      icon:     Building2,
      gradient: 'from-amber-500 to-amber-600',
      bg:       'bg-amber-50',
      text:     'text-amber-600',
      href:     isConstrutora ? '/dashboard/developments' : '/dashboard/properties',
    }] : []),
  ];

  const quickActions = [
    {
      icon:  MessageSquare,
      label: 'Conversar com um lead',
      desc:  'Atenda pelo WhatsApp, Instagram e outros canais',
      href:  '/dashboard/conversations',
      color: 'text-blue-600',
      bg:    'bg-blue-50',
    },
    {
      icon:  Kanban,
      label: isConstrutora ? 'Ver funil de leads' : 'Funil de vendas',
      desc:  'Arraste os deals entre as etapas do pipeline',
      href:  '/dashboard/kanban',
      color: 'text-emerald-600',
      bg:    'bg-emerald-50',
    },
    {
      icon:  CalendarCheck,
      label: 'Agendar visita',
      desc:  'Organize e acompanhe as visitas aos imóveis',
      href:  '/dashboard/visitas',
      color: 'text-violet-600',
      bg:    'bg-violet-50',
    },
    {
      icon:  Building2,
      label: isConstrutora ? 'Empreendimentos' : 'Catálogo de imóveis',
      desc:  isConstrutora ? 'Gerencie lançamentos e unidades' : 'Cadastre e gerencie seu portfólio',
      href:  isConstrutora ? '/dashboard/developments' : '/dashboard/properties',
      color: 'text-amber-600',
      bg:    'bg-amber-50',
    },
  ];

  return (
    <>
      <Header title="Início" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Hero greeting */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="font-bold text-2xl sm:text-3xl text-gray-900 tracking-tight">
              Olá, {firstName}! 👋
            </h2>
            <p className="text-gray-500 mt-1 text-sm">
              {currentWorkspace.name} · {isConstrutora ? 'Incorporadora / Construtora' : 'Imobiliária'}
            </p>
          </div>
          <Link
            href="/dashboard/conversations"
            className="btn-primary self-start sm:self-auto gap-2"
          >
            <Zap className="w-4 h-4" />
            Atender agora
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {statCards.map((s) => (
            <Link key={s.label} href={s.href}>
              <div className="card card-hover p-4 cursor-pointer h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', s.bg)}>
                    <s.icon className={clsx('w-4.5 h-4.5', s.text)} style={{ width: '18px', height: '18px' }} />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 mt-0.5" />
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-0.5">
                  {loading ? (
                    <div className="h-7 w-14 bg-gray-100 animate-pulse rounded" />
                  ) : (s.value ?? '—')}
                </div>
                <div className="text-xs text-gray-500 font-medium">{s.label}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* AI banner */}
        <div className="card p-4 mb-6 bg-gradient-to-r from-brand-50 to-violet-50 border-brand-100 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-glow">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-900">
              Agente IA {currentWorkspace.ai_agent_name || 'Lia'} ativo
            </p>
            <p className="text-xs text-brand-700 mt-0.5">
              Qualificando leads, roteando departamentos e respondendo automaticamente fora do horário.
            </p>
          </div>
          <Link href="/dashboard/settings" className="text-xs text-brand-600 font-semibold hover:underline flex-shrink-0 flex items-center gap-1">
            Configurar <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Quick actions */}
        <div>
          <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wider mb-3">Acesso rápido</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="card card-hover p-4 flex items-start gap-3 cursor-pointer"
              >
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', a.bg)}>
                  <a.icon className={clsx('w-4.5 h-4.5', a.color)} style={{ width: '18px', height: '18px' }} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-900 leading-tight">{a.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
