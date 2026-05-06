import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/store/auth';

interface Notification {
  id:        string;
  type:      'new_conversation' | 'new_message' | 'ticket_assigned' | 'ticket_comment' | 'ticket_updated';
  title:     string;
  body:      string;
  url?:      string;
  read:      boolean;
  createdAt: Date;
}

interface NotificationState {
  notifications:     Notification[];
  unreadCount:       number;
  soundEnabled:      boolean;
  add:               (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAllRead:       () => void;
  toggleSound:       () => void;
  requestPermission: () => void;
  initSocket:        () => void;
}

// ── Som via Web Audio API (sem arquivo externo) ───────────────────────────────

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx  = new AudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // silently fail se o navegador bloquear
  }
}

// ── Browser Notification ──────────────────────────────────────────────────────

function showBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon-192.png', tag: 'gtw-message' });
  } catch {
    // silently fail
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNotifications = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount:   0,
  soundEnabled:  true,

  add: (n) => {
    const item: Notification = {
      ...n,
      id:        crypto.randomUUID(),
      read:      false,
      createdAt: new Date(),
    };
    set((s) => ({
      notifications: [item, ...s.notifications].slice(0, 50),
      unreadCount:   s.unreadCount + 1,
    }));
  },

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount:   0,
    })),

  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

  requestPermission: () => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  initSocket: () => {
    const socket = getSocket();

    socket.on('conversation:new', (payload: { contactName: string; conversationId: string }) => {
      get().add({
        type:  'new_conversation',
        title: 'Nova conversa',
        body:  `${payload.contactName} iniciou uma conversa`,
        url:   `/dashboard/conversations?id=${payload.conversationId}`,
      });
      if (get().soundEnabled) playNotificationSound();
      showBrowserNotification('Nova conversa', `${payload.contactName} iniciou uma conversa`);
    });

    socket.on('message:new', (msg: {
      direction: string; content: string; contact_name?: string;
      conversation_id?: string; is_group?: boolean;
    }) => {
      if (msg.direction !== 'inbound') return;

      const body = msg.content || 'Mídia recebida';
      get().add({
        type:  'new_message',
        title: msg.contact_name ? `${msg.is_group ? '👥 ' : ''}${msg.contact_name}` : 'Nova mensagem',
        body,
        url:   msg.conversation_id ? `/dashboard/conversations?id=${msg.conversation_id}` : undefined,
      });

      if (get().soundEnabled) playNotificationSound();
      showBrowserNotification(
        msg.contact_name ? `Mensagem de ${msg.contact_name}` : 'Nova mensagem',
        body
      );
    });

    // ── Eventos de Tickets ────────────────────────────────────────────────────

    socket.on('ticket:updated', (payload: {
      id: string;
      title: string;
      board_id: string;
      assignee_id?: string;
      column_name?: string;
      due_date?: string;
      _userId: string;
      _assigneeChanged: boolean;
      _columnChanged:   boolean;
      _dueDateChanged:  boolean;
    }) => {
      const me = useAuth.getState().user?.id;
      if (!me || payload._userId === me) return;

      // Atribuição: só notifica o novo assignee
      if (payload._assigneeChanged && payload.assignee_id === me) {
        get().add({
          type:  'ticket_assigned',
          title: 'Ticket atribuído a você',
          body:  payload.title,
          url:   `/dashboard/tickets/${payload.board_id}/${payload.id}`,
        });
        if (get().soundEnabled) playNotificationSound();
        showBrowserNotification('Ticket atribuído a você', payload.title);
      }
    });

    socket.on('ticket:comment', (payload: {
      ticketId:    string;
      ticketTitle: string;
      boardId:     string;
      actorId:     string;
      actorName:   string;
      preview:     string;
      assigneeId?: string;
      createdBy?:  string;
    }) => {
      const me = useAuth.getState().user?.id;
      if (!me || payload.actorId === me) return;

      // Notifica se for o assignee ou o criador do ticket
      if (payload.assigneeId === me || payload.createdBy === me) {
        const body = payload.preview
          ? `${payload.actorName}: ${payload.preview}`
          : `${payload.actorName} comentou`;
        get().add({
          type:  'ticket_comment',
          title: payload.ticketTitle,
          body,
          url:   `/dashboard/tickets/${payload.boardId}/${payload.ticketId}`,
        });
        if (get().soundEnabled) playNotificationSound();
        showBrowserNotification(`Comentário: ${payload.ticketTitle}`, body);
      }
    });
  },
}));
