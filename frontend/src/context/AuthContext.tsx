import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { AuthUser, LoginResponse } from '../lib/api';
import {
  verifySessionToken,
  refreshSessionToken,
  logoutApi,
  AUTH_EXPIRED_EVENT,
} from '../lib/api';
import {
  getStoredToken,
  getStoredUser,
  saveStoredSession,
  clearStoredSession,
  isTokenValidLocally,
} from '../lib/authStorage';
import { syncPushSubscription, getNotificationPermission, unsubscribeFromPush } from '../pwa/pwaNotifications';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (response: LoginResponse) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  getDashboardUrl: (user?: AuthUser | null) => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Synchronize in-memory state with storage and verify with backend
  const restoreSession = useCallback(async () => {
    const storedToken = getStoredToken();
    const storedUser = getStoredUser();

    if (!storedToken || !storedUser) {
      clearStoredSession();
      setToken(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    // Pre-populate state from persistent storage immediately to prevent layout shifts
    setToken(storedToken);
    setUser(storedUser);

    // If device is offline (PWA offline mode), validate JWT expiry locally
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isTokenValidLocally(storedToken)) {
        setIsLoading(false);
        return;
      }
    }

    try {
      // Validate session with backend
      const response = await verifySessionToken(storedToken);
      if (response && response.user) {
        const activeToken = response.token || storedToken;
        saveStoredSession({ token: activeToken, user: response.user });
        setToken(activeToken);
        setUser(response.user);

        // Auto-sync push subscription if granted
        if (getNotificationPermission() === 'granted') {
          void syncPushSubscription(activeToken);
        }
      } else {
        clearStoredSession();
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      // If network unreachable but token still valid locally, keep user logged in for PWA
      if (typeof navigator !== 'undefined' && !navigator.onLine && isTokenValidLocally(storedToken)) {
        console.info('[AuthProvider] Network offline, preserving verified local session.');
      } else {
        console.warn('[AuthProvider] Session verification failed, clearing credentials:', error);
        clearStoredSession();
        setToken(null);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Run session restoration once on startup
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
    const handleSessionExpired = () => {
      clearStoredSession();
      setToken(null);
      setUser(null);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired);
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

  // Login handler
  const login = useCallback((response: LoginResponse) => {
    saveStoredSession(response);
    setToken(response.token);
    setUser(response.user);

    if (getNotificationPermission() === 'granted') {
      void syncPushSubscription(response.token);
    }
  }, []);

  // Logout handler
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
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      refreshSession,
      getDashboardUrl: getDashboardUrlForRole,
    }),
    [user, token, isLoading, login, logout, refreshSession],
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

