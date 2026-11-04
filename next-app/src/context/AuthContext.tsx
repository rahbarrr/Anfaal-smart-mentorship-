'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  loginWithEmail,
  verifySessionToken,
  refreshSessionToken,
  logoutApi,
  clearStoredAuth,
  getToken,
  AUTH_EXPIRED_EVENT,
  type AuthUser,
  type UserRole,
  type LoginResponse,
} from '@/lib/api';
import {
  getStoredToken,
  getStoredUser,
  saveStoredSession,
  clearStoredSession,
  isTokenValidLocally,
} from '@/lib/authStorage';
import {
  syncPushSubscription,
  getNotificationPermission,
  unsubscribeFromPush,
} from '@/pwa/pwaNotifications';

export type { AuthUser, UserRole };

export function getDashboardUrlForRole(user?: AuthUser | null): string {
  if (!user) return '/';
  if (user.role === 'ADMIN') return '/admin';
  if (user.role === 'MENTEE') return '/mentee';
  if (user.role === 'MENTOR') {
    if (user.mentorApprovalStatus === 'PENDING') return '/mentor/pending';
    if (user.mentorApprovalStatus === 'REJECTED') return '/mentor/rejected';
    return '/mentor';
  }
  return '/';
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  token: string | null;
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  getDashboardUrl: (user?: AuthUser | null) => string;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  token: null,
  loading: true,
  isLoading: true,
  isAuthenticated: false,
  login: async () => { throw new Error('AuthContext not initialized'); },
  logout: async () => {},
  refreshSession: async () => false,
  getDashboardUrl: getDashboardUrlForRole,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  // Restore stored session and verify validity with backend
  const restoreSession = useCallback(async () => {
    const storedToken = getStoredToken();
    const storedUser = getStoredUser();

    if (!storedToken || !storedUser) {
      clearStoredSession();
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    setToken(storedToken);
    setUser(storedUser);

    // If device is offline (PWA offline mode), validate JWT expiry locally
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isTokenValidLocally(storedToken)) {
        setLoading(false);
        return;
      }
    }

    try {
      const response = await verifySessionToken(storedToken);
      if (response && response.user) {
        const activeToken = response.token || storedToken;
        saveStoredSession({ token: activeToken, user: response.user });
        setToken(activeToken);
        setUser(response.user);

        // Auto-sync push subscription if permission granted
        if (getNotificationPermission() === 'granted') {
          void syncPushSubscription(activeToken);
        }
      } else {
        clearStoredSession();
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      if (typeof navigator !== 'undefined' && !navigator.onLine && isTokenValidLocally(storedToken)) {
        console.info('[AuthProvider] Network offline, preserving verified local session.');
      } else {
        console.warn('[AuthProvider] Session verification failed, clearing credentials:', error);
        clearStoredSession();
        setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  // Handle cross-tab storage changes (e.g. login/logout in another tab/PWA window)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'anfaal-token') {
        if (!e.newValue) {
          setToken(null);
          setUser(null);
        } else {
          setToken(e.newValue);
          setUser(getStoredUser());
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for 401 unauthenticated events from the central fetch wrapper
  useEffect(() => {
    const handleExpired = () => {
      clearStoredSession();
      setToken(null);
      setUser(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login?sessionExpired=true';
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  // Refresh session token helper
  const refreshSession = useCallback(async (): Promise<boolean> => {
    const currentToken = getStoredToken();
    if (!currentToken) return false;

    try {
      const response = await refreshSessionToken(currentToken);
      if (response && response.token && response.user) {
        saveStoredSession(response);
        setToken(response.token);
        setUser(response.user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  // Periodic background session refresh (every 4 hours when page is active)
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshSession();
      }
    }, 4 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token, refreshSession]);

  // Future Firebase Auth hook (ready for Phase 2 when credentials are provided)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_FIREBASE_AUTH === 'true' && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      import('@/lib/firebase/client').then(({ getFirebaseClientApp }) => {
        try {
          const { auth } = getFirebaseClientApp();
          import('firebase/auth').then(({ onAuthStateChanged }) => {
            onAuthStateChanged(auth, async (fbUser) => {
              if (fbUser) {
                const tokenResult = await fbUser.getIdTokenResult();
                const fbRole = (tokenResult.claims.role as UserRole) || 'MENTEE';
                setUser((prev) => {
                  const updated: AuthUser = {
                    id: fbUser.uid,
                    name: fbUser.displayName || prev?.name || 'User',
                    email: fbUser.email || prev?.email || '',
                    role: fbRole,
                    makid: (tokenResult.claims.makid as string) || prev?.makid,
                    menteeId: (tokenResult.claims.menteeId as string) || prev?.menteeId,
                    mentorApprovalStatus: (tokenResult.claims.mentorApprovalStatus as any) || prev?.mentorApprovalStatus,
                  };
                  saveStoredSession({ token: token || '', user: updated });
                  return updated;
                });
              }
            });
          });
        } catch {
          // Firebase not initialized, running in standard API mode
        }
      });
    }
  }, [token]);

  const login = useCallback(async (identifier: string, password: string): Promise<AuthUser> => {
    const data = await loginWithEmail(identifier, password);

    saveStoredSession(data);
    setToken(data.token);
    setUser(data.user);

    if (typeof window !== 'undefined') {
      document.cookie = `anfaal-token=${data.token}; path=/; max-age=604800; SameSite=Lax`;
    }

    if (getNotificationPermission() === 'granted') {
      void syncPushSubscription(data.token);
    }

    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const activeToken = token || getStoredToken();
    try {
      if (activeToken) {
        await Promise.allSettled([
          unsubscribeFromPush(activeToken),
          logoutApi(activeToken),
        ]);
      }
    } finally {
      clearStoredSession();
      if (typeof window !== 'undefined') {
        document.cookie = 'anfaal-token=; path=/; max-age=0; SameSite=Lax';
      }

      // Sign out of Firebase if enabled
      if (process.env.NEXT_PUBLIC_ENABLE_FIREBASE_AUTH === 'true' && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        try {
          const { getFirebaseClientApp } = await import('@/lib/firebase/client');
          const { signOut } = await import('firebase/auth');
          const { auth } = getFirebaseClientApp();
          await signOut(auth);
        } catch {
          // Ignore
        }
      }

      setToken(null);
      setUser(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      role: user?.role || null,
      token,
      loading,
      isLoading: loading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      refreshSession,
      getDashboardUrl: getDashboardUrlForRole,
    }),
    [user, token, loading, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
