'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { RefreshCw, RepeatIcon, StopCircle, ArrowLeft, ExternalLink, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RecurringTicket {
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  recurrence_type: string;
  recurrence_interval: number | null;
  recurrence_end: string | null;
  is_recurring: boolean;
  created_at: string;
  board_id: string;
  board_name: string;
  board_color: string | null;
  column_name: string;
  assignee_name: string | null;
  spawn_count: number;
  last_spawn_at: string | null;
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily:    'Diariamente',
  weekly:   'Semanalmente',
  biweekly: 'A cada 15 dias',
  monthly:  'Mensalmente',
  yearly:   'Anualmente',
  custom:   'Personalizado',
};

const PRIORITY_COLOR: Record<string, string> = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function RecurringTicketsPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuth();

  const [tickets,  setTickets]  = useState<RecurringTicket[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [stopping, setStopping] = useState<string | null>(null);
  // endDate per ticket being edited
  const [editEnd,  setEditEnd]  = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get<RecurringTicket[]>(
        `/workspaces/${currentWorkspace.id}/tickets/recurring`
      );
      setTickets(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleStop(ticketId: string) {
    if (!currentWorkspace) return;
    if (!confirm('Parar a recorrência deste ticket? Ele continuará existindo, mas não gerará novas cópias.')) return;
    setStopping(ticketId);
    try {
      await api.put(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}`, {
        isRecurring: false,
      });
      setTickets(prev => prev.filter(t => t.id !== ticketId));
    } finally {
      setStopping(null);
    }
  }

  async function handleSetEnd(ticketId: string) {
    if (!currentWorkspace) return;
    const date = editEnd[ticketId];
    if (!date) return;
    await api.put(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}`, {
      recurrenceEnd: new Date(date).toISOString(),
    });
    setTickets(prev => prev.map(t =>
      t.id === ticketId ? { ...t, recurrence_end: new Date(date).toISOString() } : t
    ));
    setEditEnd(prev => { const n = { ...prev }; delete n[ticketId]; return n; });
  }

  async function handleClearEnd(ticketId: string) {
    if (!currentWorkspace) return;
    await api.put(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}`, {
      recurrenceEnd: null,
    });
    setTickets(prev => prev.map(t =>
      t.id === ticketId ? { ...t, recurrence_end: null } : t
    ));
  }

  const active   = tickets.filter(t => !t.recurrence_end || new Date(t.recurrence_end) > new Date());
  const expiring = tickets.filter(t => t.recurrence_end && new Date(t.recurrence_end) > new Date());

  if (!currentWorkspace) return null;

  return (
    <>
      <Header
        title="Tickets Recorrentes"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard/tickets')} className="btn-secondary text-sm flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Boards
            </button>
            <button onClick={load} className="btn-secondary text-sm">
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16">
            <RepeatIcon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhum ticket recorrente</p>
            <p className="text-sm text-gray-400 mt-1">
              Abra um ticket e ative a opção "Tarefa recorrente" na sidebar de detalhes.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl space-y-3">

            <p className="text-sm text-gray-500 mb-4">
              {active.length} ticket{active.length !== 1 ? 's' : ''} recorrente{active.length !== 1 ? 's' : ''} ativo{active.length !== 1 ? 's' : ''}.
              {expiring.length > 0 && ` ${expiring.length} com data de encerramento definida.`}
            </p>

            {tickets.map(ticket => {
              const isExpired  = ticket.recurrence_end && new Date(ticket.recurrence_end) <= new Date();
              const hasEndDate = !!ticket.recurrence_end;
              const isEditing  = editEnd[ticket.id] !== undefined;

              return (
                <div
                  key={ticket.id}
                  className={clsx(
                    'bg-white rounded-2xl border p-5 space-y-3',
                    isExpired ? 'border-gray-200 opacity-60' : 'border-gray-200'
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: ticket.board_color || '#6366f1' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm">{ticket.title}</h3>
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_COLOR[ticket.priority])}>
                          {ticket.priority}
                        </span>
                        {isExpired && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                            Encerrada
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ticket.board_name} · {ticket.column_name}
                        {ticket.assignee_name && ` · ${ticket.assignee_name}`}
                      </p>
                    </div>
                    <button
                      onClick={() => router.push(`/dashboard/tickets/${ticket.board_id}/${ticket.id}`)}
                      className="text-gray-400 hover:text-indigo-600 p-1 flex-shrink-0"
                      title="Abrir ticket"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Info chips */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium">
                      <RepeatIcon className="w-3 h-3" />
                      {RECURRENCE_LABEL[ticket.recurrence_type] || ticket.recurrence_type}
                      {ticket.recurrence_type === 'custom' && ticket.recurrence_interval
                        ? ` (${ticket.recurrence_interval} dias)` : ''}
                    </span>
                    {ticket.due_date && (
                      <span className="flex items-center gap-1 bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                        <Calendar className="w-3 h-3" />
                        Horário: {format(new Date(ticket.due_date), "HH:mm", { locale: ptBR })}
                      </span>
                    )}
                    <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      {ticket.spawn_count} cópia{ticket.spawn_count !== 1 ? 's' : ''} gerada{ticket.spawn_count !== 1 ? 's' : ''}
                    </span>
                    {ticket.last_spawn_at && (
                      <span className="bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                        Última: {formatDistanceToNow(new Date(ticket.last_spawn_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                  </div>

                  {/* Data de encerramento */}
                  <div className="border-t border-gray-100 pt-3 flex items-center gap-3 flex-wrap">
                    {hasEndDate && !isEditing ? (
                      <>
                        <span className="text-xs text-gray-500">
                          Encerra em: <strong>{format(new Date(ticket.recurrence_end!), "dd/MM/yyyy", { locale: ptBR })}</strong>
                        </span>
                        <button
                          onClick={() => setEditEnd(prev => ({ ...prev, [ticket.id]: ticket.recurrence_end!.split('T')[0] }))}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Alterar
                        </button>
                        <button
                          onClick={() => handleClearEnd(ticket.id)}
                          className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                        >
                          Remover data
                        </button>
                      </>
                    ) : isEditing ? (
                      <>
                        <input
                          type="date"
                          value={editEnd[ticket.id]}
                          onChange={e => setEditEnd(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                          className="input text-xs py-1"
                          min={new Date().toISOString().split('T')[0]}
                        />
                        <button onClick={() => handleSetEnd(ticket.id)} className="btn-primary text-xs py-1 px-3">
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditEnd(prev => { const n = { ...prev }; delete n[ticket.id]; return n; })}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditEnd(prev => ({ ...prev, [ticket.id]: '' }))}
                        className="text-xs text-gray-400 hover:text-indigo-600 hover:underline"
                      >
                        + Definir data de encerramento
                      </button>
                    )}

                    {/* Parar agora */}
                    {!isExpired && (
                      <button
                        onClick={() => handleStop(ticket.id)}
                        disabled={stopping === ticket.id}
                        className="ml-auto flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        {stopping === ticket.id ? 'Parando...' : 'Parar recorrência'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
