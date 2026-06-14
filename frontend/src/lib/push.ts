import api from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('[push] falha ao registrar service worker:', err);
    return null;
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Pede inscrição de push ao navegador e registra no backend.
// Requer que o usuário já tenha concedido permissão de notificação.
export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const registration = await registerServiceWorker();
    if (!registration) return false;
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const { data } = await api.get<{ publicKey: string | null }>('/push/vapid-public-key');
      if (!data.publicKey) return false;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }

    const json = subscription.toJSON();
    await api.post('/push/subscribe', { endpoint: subscription.endpoint, keys: json.keys });
    return true;
  } catch (err) {
    console.error('[push] erro ao inscrever:', err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    const subscription = await getPushSubscription();
    if (!subscription) return;
    await api.post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe();
  } catch (err) {
    console.error('[push] erro ao remover inscrição:', err);
  }
}
