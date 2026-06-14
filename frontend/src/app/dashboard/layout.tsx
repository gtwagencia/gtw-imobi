'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useNotifications } from '@/store/notifications';
import { useAlerts } from '@/store/alerts';
import { useCrmAlerts } from '@/store/crmAlerts';
import { connectSocket } from '@/lib/socket';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router      = useRouter();
  const { user, accessToken, currentWorkspace, _hasHydrated, _sessionChecked, restoreSession } = useAuth();
  const initSocket        = useNotifications((s) => s.initSocket);
  const requestPermission = useNotifications((s) => s.requestPermission);
  const loadAlerts        = useAlerts((s) => s.load);
  const initAlertsSocket  = useAlerts((s) => s.initSocket);
  const loadCrmAlerts       = useCrmAlerts((s) => s.load);
  const initCrmAlertsSocket = useCrmAlerts((s) => s.initSocket);

  useEffect(() => {
    if (!_hasHydrated) return;

    // Página recarregada: tenta restaurar a sessão via cookie httpOnly antes de decidir
    if (!accessToken && !_sessionChecked) {
      restoreSession();
      return;
    }
    if (!accessToken || !user) {
      router.replace('/login');
      return;
    }
    if (!currentWorkspace) {
      router.replace('/select');
      return;
    }
    connectSocket(currentWorkspace.id, accessToken);
    initSocket();
    requestPermission();
    loadAlerts(currentWorkspace.id);
    initAlertsSocket(user.id);
    loadCrmAlerts(currentWorkspace.id);
    initCrmAlertsSocket(user.id);
  }, [_hasHydrated, _sessionChecked, accessToken, user, currentWorkspace, router, restoreSession, initSocket, requestPermission, loadAlerts, initAlertsSocket, loadCrmAlerts, initCrmAlertsSocket]);

  if (!_hasHydrated || (!accessToken && !_sessionChecked) || !accessToken || !user || !currentWorkspace) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
