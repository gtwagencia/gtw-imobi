import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
import api from '@/lib/api';
import type { TicketAlert } from '@/types';

interface AlertsState {
  alerts:      TicketAlert[];
  unreadCount: number;
  load:        (workspaceId: string) => Promise<void>;
  addAlert:    (a: TicketAlert) => void;
  markRead:    (alertId: string, workspaceId: string) => Promise<void>;
  markAllRead: (workspaceId: string) => Promise<void>;
  initSocket:  (userId: string) => void;
}

// Handler ref para não duplicar listener
let _handlerAlert: ((a: TicketAlert) => void) | null = null;

export const useAlerts = create<AlertsState>((set, get) => ({
  alerts:      [],
  unreadCount: 0,

  load: async (workspaceId) => {
    try {
      const { data } = await api.get<TicketAlert[]>(`/workspaces/${workspaceId}/tickets/my-alerts`);
      set({ alerts: data, unreadCount: data.length });
    } catch { /* silently ignore */ }
  },

  addAlert: (a) => set((s) => ({
    alerts:      [a, ...s.alerts].slice(0, 50),
    unreadCount: s.unreadCount + 1,
  })),

  markRead: async (alertId, workspaceId) => {
    await api.put(`/workspaces/${workspaceId}/tickets/alerts/${alertId}/read`).catch(() => {});
    set((s) => ({
      alerts:      s.alerts.filter((a) => a.id !== alertId),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async (workspaceId) => {
    await api.put(`/workspaces/${workspaceId}/tickets/alerts/read-all`).catch(() => {});
    set({ alerts: [], unreadCount: 0 });
  },

  initSocket: (userId) => {
    const socket = getSocket();
    if (_handlerAlert) { socket.off('ticket:alert', _handlerAlert); }

    _handlerAlert = (data: TicketAlert) => {
      if (data.user_id === userId) get().addAlert(data);
    };
    socket.on('ticket:alert', _handlerAlert);
  },
}));
