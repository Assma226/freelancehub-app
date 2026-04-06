import { AuthUserDto } from './api.dto';

const TOKEN_KEY = 'fh_token';
const USER_KEY = 'fh_user';
const BASE_URL_KEY = 'fh_api_base';

export function apiBaseUrl(): string {
  const stored = localStorage.getItem(BASE_URL_KEY)?.trim();
  if (stored) return stored.replace(/\/+$/, '');
  return 'http://127.0.0.1:5000';
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function setApiBaseUrl(url: string): void {
  localStorage.setItem(BASE_URL_KEY, url.trim().replace(/\/+$/, ''));
}

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredUser(): AuthUserDto | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as AuthUserDto : null;
  } catch {
    return null;
  }
}

export function getStoredUserId(): string {
  return getStoredUser()?.id || '';
}

export function getSessionUser(): AuthUserDto | null {
  return getStoredUser();
}

export function storeSession(token: string, user: AuthUserDto): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function apiAuthHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  const userId = getStoredUserId();

  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  return headers;
}
