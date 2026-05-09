'use client';

import { useRef, useState, useEffect } from 'react';
import { Bell, Menu, MessageSquare, Ticket, UserCheck, MessageCircle, Users, AtSign } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useNotifications } from '@/store/notifications';
import { useAlerts } from '@/store/alerts';
import { useSidebar } from '@/store/sidebar';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

interface HeaderProps {
  title:    string;
  actions?: React.ReactNode;
}

const NOTIF_CONFIG = {
  new_conversation: { icon: MessageSquare, color: 'text-green-500',  bg: 'bg-green-50',  label: 'Conversa'  },
  new_message:      { icon: MessageSquare, color: 'text-brand-500',  bg: 'bg-brand-50',  label: 'Mensagem'  },
  ticket_assigned:  { icon: UserCheck,     color: 'text-indigo-500', bg: 'bg-indigo-50', label: 'Ticket'    },
  ticket_comment:   { icon: MessageCircle, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Comentário'},
  ticket_updated:   { icon: Ticket,        color: 'text-orange-500', bg: 'bg-orange-50', label: 'Ticket'    },
} as const;

export default function Header({ title, actions }: HeaderProps) {
  const { currentWorkspace }                        = useAuth();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const { alerts, unreadCount: alertCount, markRead, markAllRead: markAllAlerts } = useAlerts();
  const { toggle } = useSidebar();
  const router = useRouter();

  const [open,      setOpen]      = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const dropRef      = useRef<HTMLDivElement>(null);
  const alertDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current      && !dropRef.current.contains(e.target as Node))      setOpen(false);
      if (alertDropRef.current && !alertDropRef.current.contains(e.target as Node)) setOpenAlert(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  }

  return (
    <header className="h-14 md:h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 flex-shrink-0 z-10 gap-3">
      {/* Hamburguer — só mobile */}
      <button
        onClick={toggle}
        className="md:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-base md:text-lg font-semibold text-gray-900 truncate">{title}</h1>
        {currentWorkspace && (
          <p className="text-xs text-gray-400 truncate">{currentWorkspace.name}</p>
        )}
      </div>

      <div className="flex items-center gap-3 ml-4">
        {actions}

        {/* Alerts bell — atribuições e @menções de tickets */}
        <div className="relative" ref={alertDropRef}>
          <button
            onClick={() => setOpenAlert((v) => !v)}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Alertas de tickets"
          >
            <AtSign className="w-5 h-5" />
            {alertCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white text-xs
                               rounded-full flex items-center justify-center font-medium leading-none">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {openAlert && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl
                            border border-gray-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">Alertas de tickets</span>
                {alertCount > 0 && currentWorkspace && (
                  <button
                    onClick={() => markAllAlerts(currentWorkspace.id)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Limpar todos
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                {alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                    <AtSign className="w-8 h-8 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Nenhum alerta pendente</p>
                  </div>
                ) : (
                  alerts.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        if (currentWorkspace) markRead(a.id, currentWorkspace.id);
                        router.push(`/dashboard/tickets/${a.board_id}/${a.ticket_id}`);
                        setOpenAlert(false);
                      }}
                    >
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        a.type === 'assigned' ? 'bg-blue-50' : 'bg-indigo-50'
                      )}>
                        {a.type === 'assigned'
                          ? <UserCheck className="w-4 h-4 text-blue-500" />
                          : <AtSign    className="w-4 h-4 text-indigo-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.ticket_title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{a.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notification bell */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={handleOpen}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100
                       rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs
                               rounded-full flex items-center justify-center font-medium leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl
                            border border-gray-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">Notificações</span>
                {notifications.length > 0 && (
                  <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                    Marcar tudo como lido
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                    <Bell className="w-8 h-8 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Nenhuma notificação ainda</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const cfg = NOTIF_CONFIG[n.type] ?? NOTIF_CONFIG.new_message;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (n.url) { router.push(n.url); setOpen(false); }
                        }}
                        className={clsx(
                          'flex items-start gap-3 px-4 py-3 transition-colors',
                          n.url && 'cursor-pointer hover:bg-gray-50',
                          !n.read && 'bg-blue-50/40'
                        )}
                      >
                        {/* Ícone colorido por tipo */}
                        <div className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                          cfg.bg
                        )}>
                          <Icon className={clsx('w-4 h-4', cfg.color)} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={clsx('text-xs font-semibold uppercase tracking-wide', cfg.color)}>
                              {cfg.label}
                            </span>
                            {!n.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
