'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { Message, Conversation } from '@/types';

// Cria o AudioContext uma única vez após interação do usuário
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

// Inicializa o AudioContext na primeira interação do usuário
if (typeof window !== 'undefined') {
  const init = () => { getAudioCtx(); window.removeEventListener('click', init); };
  window.addEventListener('click', init, { once: true });
}

function playSound() {
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

function showBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // Browser notification só quando a janela não está visível
  if (document.visibilityState === 'visible') return;
  try { new Notification(title, { body, icon: '/favicon.ico', tag }); } catch { /* ignore */ }
}

/**
 * Hook de notificações para a página de Conversas.
 * - Toca som para toda mensagem inbound (janela visível ou não)
 * - Mostra notificação browser quando janela está em background
 * - Não notifica mensagens da conversa atualmente aberta
 */
export function useNotifications(activeConversationId?: string | null) {
  const permissionRef = useRef<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    permissionRef.current = Notification.permission;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { permissionRef.current = p; });
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    function onConversationNew(conv: Partial<Conversation> & { contactName?: string; conversationId: string }) {
      playSound();
      showBrowserNotification('Nova conversa — GTW', conv.contactName || 'Novo contato', `conv-new-${conv.conversationId}`);
    }

    function onMessageNew(msg: Message & { sender_name?: string; is_group?: boolean }) {
      if (msg.direction !== 'inbound') return;
      // Não notifica a conversa aberta (usuário já está vendo)
      if (activeConversationId && msg.conversation_id === activeConversationId) return;

      playSound();

      const title = msg.is_group ? 'Nova mensagem em grupo — GTW' : 'Nova mensagem — GTW';
      const body  = msg.sender_name
        ? `${msg.sender_name}: ${msg.content || 'Mídia'}`
        : (msg.content || 'Mídia recebida');

      showBrowserNotification(title, body, `msg-${msg.id}`);
    }

    socket.on('conversation:new', onConversationNew);
    socket.on('message:new',      onMessageNew);

    return () => {
      socket.off('conversation:new', onConversationNew);
      socket.off('message:new',      onMessageNew);
    };
  }, [activeConversationId]);
}
