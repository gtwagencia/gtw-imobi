'use client';

import { useEffect } from 'react';
import { useNotifications as useNotificationStore } from '@/store/notifications';

/**
 * Informa à store de notificações qual conversa está aberta,
 * para que o handler de message:new não notifique a conversa visível.
 * Centraliza tudo no store — sem listener duplicado.
 */
export function useNotifications(activeConversationId?: string | null) {
  const setActiveConversation = useNotificationStore((s) => s.setActiveConversation);

  useEffect(() => {
    setActiveConversation(activeConversationId ?? null);
    return () => setActiveConversation(null);
  }, [activeConversationId, setActiveConversation]);
}
