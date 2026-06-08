import { authHeaders, clearSession } from './session.js';

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(url, options = {}) {
  const headers = authHeaders({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  });

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new AuthError('Session expired. Please log in again.', 401);
  }

  return res;
}

export async function apiJson(url, options = {}) {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      /* ignore */
    }
    throw new AuthError(message, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}
