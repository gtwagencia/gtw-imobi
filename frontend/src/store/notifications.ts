import { create } from 'zustand';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/store/auth';
import { subscribeToPush } from '@/lib/push';

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
  notifications:        Notification[];
  unreadCount:          number;
  soundEnabled:         boolean;
  activeConversationId: string | null;
  add:                  (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAllRead:          () => void;
  toggleSound:          () => void;
  requestPermission:    () => void;
  setActiveConversation:(id: string | null) => void;
  initSocket:           () => void;
}

// ── AudioContext singleton ────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) _audioCtx = new Ctx();
    }
    return _audioCtx;
  } catch { return null; }
}

if (typeof window !== 'undefined') {
  const init = () => { getAudioCtx(); window.removeEventListener('click', init); };
  window.addEventListener('click', init, { once: true });
}

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

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
  } catch { /* silently ignore */ }
}

// ── Browser Notification ──────────────────────────────────────────────────────

function showBrowserNotification(title: string, body: string, tag?: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // Só mostra quando a aba está em background
  if (document.visibilityState === 'visible') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico', tag: tag || 'gtw-message' });
  } catch { /* ignore */ }
}

// ── Refs dos handlers para remoção precisa ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => void;
let _handlerConvNew:      AnyFn | null = null;
let _handlerMsgNew:       AnyFn | null = null;
let _handlerTicketUpd:    AnyFn | null = null;
let _handlerTicketComment: AnyFn | null = null;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNotifications = create<NotificationState>((set, get) => ({
  notifications:        [],
  unreadCount:          0,
  soundEnabled:         true,
  activeConversationId: null,

  add: (n) => {
    const item: Notification = { ...n, id: crypto.randomUUID(), read: false, createdAt: new Date() };
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
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') subscribeToPush();
      });
    } else if (Notification.permission === 'granted') {
      subscribeToPush();
    }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  initSocket: () => {
    const socket = getSocket();

    // Remove apenas os handlers desta store antes de re-registrar
    if (_handlerConvNew)       { socket.off('conversation:new', _handlerConvNew);     _handlerConvNew       = null; }
    if (_handlerMsgNew)        { socket.off('message:new',      _handlerMsgNew);      _handlerMsgNew        = null; }
    if (_handlerTicketUpd)     { socket.off('ticket:updated',   _handlerTicketUpd);   _handlerTicketUpd     = null; }
    if (_handlerTicketComment) { socket.off('ticket:comment',   _handlerTicketComment); _handlerTicketComment = null; }

    _handlerConvNew = (payload: { contactName: string; conversationId: string }) => {
      get().add({
        type:  'new_conversation',
        title: 'Nova conversa',
        body:  `${payload.contactName} iniciou uma conversa`,
        url:   `/dashboard/conversations?id=${payload.conversationId}`,
      });
      if (get().soundEnabled) playNotificationSound();
      showBrowserNotification('Nova conversa', `${payload.contactName} iniciou uma conversa`, `conv-new-${payload.conversationId}`);
    };

    _handlerMsgNew = (msg: {
      id?: string; direction: string; content: string; contact_name?: string;
      conversation_id?: string; is_group?: boolean; assignee_id?: string | null;
    }) => {
      if (msg.direction !== 'inbound') return;

      // Só notifica se a conversa está atribuída ao usuário atual ou a ninguém
      const me = useAuth.getState().user?.id;
      if (msg.assignee_id && msg.assignee_id !== me) return;

      // Não notifica a conversa que está aberta no momento
      const active = get().activeConversationId;
      if (active && msg.conversation_id === active) return;

      const title = msg.contact_name
        ? `${msg.is_group ? '👥 ' : ''}${msg.contact_name}`
        : 'Nova mensagem';
      const body = msg.content || 'Mídia recebida';

      get().add({
        type:  'new_message',
        title,
        body,
        url:   msg.conversation_id ? `/dashboard/conversations?id=${msg.conversation_id}` : undefined,
      });

      if (get().soundEnabled) playNotificationSound();
      showBrowserNotification(
        msg.contact_name ? `Mensagem de ${msg.contact_name}` : 'Nova mensagem',
        body,
        `msg-${msg.id || msg.conversation_id}`
      );
    };

    _handlerTicketUpd = (payload: {
      id: string; title: string; board_id: string;
      assignee_id?: string; _userId: string; _assigneeChanged: boolean;
    }) => {
      const me = useAuth.getState().user?.id;
      if (!me || payload._userId === me) return;
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
    };

    _handlerTicketComment = (payload: {
      ticketId: string; ticketTitle: string; boardId: string;
      actorId: string; actorName: string; preview: string;
      assigneeId?: string; createdBy?: string;
    }) => {
      const me = useAuth.getState().user?.id;
      if (!me || payload.actorId === me) return;
      if (payload.assigneeId === me || payload.createdBy === me) {
        const body = payload.preview ? `${payload.actorName}: ${payload.preview}` : `${payload.actorName} comentou`;
        get().add({
          type:  'ticket_comment',
          title: payload.ticketTitle,
          body,
          url:   `/dashboard/tickets/${payload.boardId}/${payload.ticketId}`,
        });
        if (get().soundEnabled) playNotificationSound();
        showBrowserNotification(`Comentário: ${payload.ticketTitle}`, body);
      }
    };

    socket.on('conversation:new', _handlerConvNew);
    socket.on('message:new',      _handlerMsgNew);
    socket.on('ticket:updated',   _handlerTicketUpd);
    socket.on('ticket:comment',   _handlerTicketComment);
  },
}));
