import type { AuthUser, LoginResponse } from './api';

const TOKEN_KEY = 'anfaal-token';
const USER_KEY = 'anfaal-user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: LoginResponse): void {
  try {
    if (session.token) {
      localStorage.setItem(TOKEN_KEY, session.token);
    }
    if (session.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    }
  } catch (err) {
    console.warn('[authStorage] Failed to save session to storage:', err);
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    console.warn('[authStorage] Failed to clear session from storage:', err);
  }
}

export function isTokenValidLocally(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const decoded = JSON.parse(jsonPayload);
    if (decoded.exp && typeof decoded.exp === 'number') {
      // Buffer by 60 seconds
      return decoded.exp * 1000 > Date.now() + 60000;
    }
    return true;
  } catch {
    return false;
  }
}

