import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
import api from '@/lib/api';
import type { CrmNotification } from '@/types';

interface CrmAlertsState {
  alerts:      CrmNotification[];
  unreadCount: number;
  load:        (workspaceId: string) => Promise<void>;
  addAlert:    (a: CrmNotification) => void;
  markRead:    (alertId: string, workspaceId: string) => Promise<void>;
  markAllRead: (workspaceId: string) => Promise<void>;
  initSocket:  (userId: string) => void;
}

// Handler ref para não duplicar listener
let _handlerCrmAlert: ((a: CrmNotification) => void) | null = null;

export const useCrmAlerts = create<CrmAlertsState>((set, get) => ({
  alerts:      [],
  unreadCount: 0,

  load: async (workspaceId) => {
    try {
      const { data } = await api.get<CrmNotification[]>(`/workspaces/${workspaceId}/notifications`);
      set({ alerts: data, unreadCount: data.length });
    } catch { /* silently ignore */ }
  },

  addAlert: (a) => set((s) => ({
    alerts:      [a, ...s.alerts].slice(0, 50),
    unreadCount: s.unreadCount + 1,
  })),

  markRead: async (alertId, workspaceId) => {
    await api.put(`/workspaces/${workspaceId}/notifications/${alertId}/read`).catch(() => {});
    set((s) => ({
      alerts:      s.alerts.filter((a) => a.id !== alertId),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async (workspaceId) => {
    await api.put(`/workspaces/${workspaceId}/notifications/read-all`).catch(() => {});
    set({ alerts: [], unreadCount: 0 });
  },

  initSocket: (userId) => {
    const socket = getSocket();
    if (_handlerCrmAlert) { socket.off('crm:notification', _handlerCrmAlert); }

    _handlerCrmAlert = (data: CrmNotification) => {
      if (data.user_id === userId) get().addAlert(data);
    };
    socket.on('crm:notification', _handlerCrmAlert);
  },
}));
