'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  loginWithEmail,
  clearStoredAuth,
  getToken,
  AUTH_EXPIRED_EVENT,
  type AuthUser,
  type UserRole,
} from '@/lib/api';

export type { AuthUser, UserRole };

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  login: async () => { throw new Error('AuthContext not initialized'); },
  logout: async () => {},
});

const USER_STORAGE_KEY = 'anfaal-user';
const TOKEN_STORAGE_KEY = 'anfaal-token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore stored session on client mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const cached = localStorage.getItem(USER_STORAGE_KEY);
      if (storedToken && cached) {
        const parsed = JSON.parse(cached) as AuthUser;
        setUser(parsed);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }

    // Listen to session expiry events triggered by 401 API responses
    const handleExpired = () => {
      clearStoredAuth();
      setUser(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login?sessionExpired=true';
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

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
                  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
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
  }, []);

  const login = async (identifier: string, password: string): Promise<AuthUser> => {
    // Authenticate with the existing Express backend API
    const data = await loginWithEmail(identifier, password);

    // Save token and user in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      // Store in cookie for server-side route guards if needed
      document.cookie = `anfaal-token=${data.token}; path=/; max-age=604800; SameSite=Lax`;
    }

    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    clearStoredAuth();
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

    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
