import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, OrgSummary, Workspace } from '@/types';
import api from '@/lib/api';
import { getCookie } from '@/lib/cookies';

export type LoginResult =
  | { twoFactorRequired: true; challenge: string }
  | { twoFactorRequired: false };

interface AuthState {
  user:             User | null;
  currentOrg:       OrgSummary | null;
  currentWorkspace: Workspace | null;
  accessToken:      string | null;
  csrfToken:        string | null;
  _hasHydrated:     boolean;
  _sessionChecked:  boolean;

  login:            (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor:  (challenge: string, code: string) => Promise<void>;
  register:         (name: string, email: string, password: string, orgName?: string) => Promise<void>;
  logout:           () => void;
  setOrg:           (org: OrgSummary) => void;
  setWorkspace:     (ws: Workspace) => void;
  fetchMe:          () => Promise<void>;
  setHasHydrated:   (v: boolean) => void;
  /** Tenta restaurar a sessão usando o cookie httpOnly de refresh. Retorna true se bem-sucedido. */
  restoreSession:   () => Promise<boolean>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user:             null,
      currentOrg:       null,
      currentWorkspace: null,
      accessToken:      null,
      csrfToken:        null,
      _hasHydrated:     false,
      _sessionChecked:  false,
      setHasHydrated:   (v) => set({ _hasHydrated: v }),

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        if (data.twoFactorRequired) {
          return { twoFactorRequired: true, challenge: data.challenge };
        }
        set({
          user:            data.user,
          accessToken:     data.accessToken,
          csrfToken:       data.csrfToken,
          currentOrg:      data.user.orgs[0] || null,
          _sessionChecked: true,
        });
        return { twoFactorRequired: false };
      },

      verifyTwoFactor: async (challenge, code) => {
        const { data } = await api.post('/auth/login/2fa', { challenge, code });
        set({
          user:            data.user,
          accessToken:     data.accessToken,
          csrfToken:       data.csrfToken,
          currentOrg:      data.user.orgs[0] || null,
          _sessionChecked: true,
        });
      },

      register: async (name, email, password, orgName) => {
        const { data } = await api.post('/auth/register', { name, email, password, orgName });
        set({
          user:            data.user,
          accessToken:     data.accessToken,
          csrfToken:       data.csrfToken,
          currentOrg:      data.user.orgs[0] || null,
          _sessionChecked: true,
        });
      },

      logout: () => {
        const csrf = get().csrfToken || getCookie('gtw_csrf');
        api.post('/auth/logout', {}, { headers: csrf ? { 'X-CSRF-Token': csrf } : {} }).catch(() => {});
        set({
          user: null, currentOrg: null, currentWorkspace: null,
          accessToken: null, csrfToken: null, _sessionChecked: true,
        });
      },

      setOrg: (org) => set({ currentOrg: org, currentWorkspace: null }),
      setWorkspace: (ws) => set({ currentWorkspace: ws }),

      fetchMe: async () => {
        const { data } = await api.get('/auth/me');
        set({ user: data });
      },

      restoreSession: async () => {
        try {
          const csrf = getCookie('gtw_csrf');
          const { data } = await api.post('/auth/refresh', {}, {
            headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          });
          set({
            accessToken:     data.accessToken,
            csrfToken:       data.csrfToken,
            _sessionChecked: true,
          });

          const me = await api.get('/auth/me');
          set((state) => ({
            user:       me.data,
            currentOrg: state.currentOrg ?? (me.data.orgs[0] || null),
          }));
          return true;
        } catch {
          set({
            user: null, currentOrg: null, currentWorkspace: null,
            accessToken: null, csrfToken: null, _sessionChecked: true,
          });
          return false;
        }
      },
    }),
    {
      name: 'gtw-auth',
      partialize: (s) => ({
        user:             s.user,
        currentOrg:       s.currentOrg,
        currentWorkspace: s.currentWorkspace,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
