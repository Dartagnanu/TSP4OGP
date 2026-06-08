import { setSession, clearSession, getSession } from './session.js';
import { apiJson } from './apiClient.js';

let onLoginSuccess = null;

export function setLoginSuccessHandler(fn) {
  onLoginSuccess = fn;
}

export function showLogin(message = '') {
  const overlay = document.getElementById('loginOverlay');
  const appShell = document.getElementById('appShell');
  const err = document.getElementById('loginError');
  if (overlay) overlay.classList.remove('hidden');
  if (appShell) appShell.classList.add('hidden');
  if (err) err.textContent = message;
}

export function hideLogin() {
  const overlay = document.getElementById('loginOverlay');
  const appShell = document.getElementById('appShell');
  if (overlay) overlay.classList.add('hidden');
  if (appShell) appShell.classList.remove('hidden');
}

export async function login(username, password, store_number) {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: String(username || '').trim().toLowerCase(),
      password,
      store_number: Number(store_number),
    }),
  });

  const contentType = res.headers.get('content-type') || '';
  let body = {};
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => ({}));
  } else {
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(
        text?.slice(0, 120) ||
          'Server error — check that the app container is running and bcrypt is installed'
      );
    }
  }

  if (!res.ok) {
    // #region agent log
    fetch('http://127.0.0.1:7564/ingest/326e187e-4e6f-4a2c-af02-5659473e063d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5bfbd6'},body:JSON.stringify({sessionId:'5bfbd6',location:'login.js:login',message:'login failed',data:{status:res.status,error:body.error},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    throw new Error(body.error || 'Login failed');
  }
  setSession(body);
  return body;
}

export async function logout() {
  try {
    await apiJson('/auth/logout', { method: 'POST' });
  } catch {
    /* session may already be invalid */
  }
  clearSession();
  showLogin();
}

export async function validateSession() {
  const session = getSession();
  if (!session?.token) return null;
  try {
    const me = await apiJson('/auth/me');
    return { ...session, ...me };
  } catch {
    clearSession();
    return null;
  }
}

export function bindLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername')?.value?.trim().toLowerCase();
    const password = document.getElementById('loginPassword')?.value ?? '';
    const store_number = document.getElementById('loginStoreNumber')?.value;
    const err = document.getElementById('loginError');
    if (err) err.textContent = '';

    try {
      const session = await login(username, password, store_number);
      if (onLoginSuccess) {
        await onLoginSuccess(session);
      }
      updateSessionDisplay(session);
      hideLogin();
    } catch (ex) {
      showLogin();
      if (err) {
        err.textContent =
          ex.message ||
          'Login failed. If the store does not exist, run: docker compose --profile seed run --rm seed';
      }
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
}

export function updateSessionDisplay(session) {
  const el = document.getElementById('sessionInfo');
  if (!el || !session) return;
  const name = session.display_name || session.username;
  el.textContent = `${name} @ store ${session.store_number}`;
}

export async function loadActivityPanels() {
  const myList = document.getElementById('myActivityList');
  const storeList = document.getElementById('storeAccessList');
  const session = getSession();
  if (!session?.token) return;

  try {
    if (myList) {
      const logs = await apiJson('/auth/history/me?limit=20');
      myList.innerHTML = logs.length
        ? logs
            .map(
              (l) =>
                `<li><span class="activity-action">${l.action}</span> ${l.summary} <time>${new Date(l.created_at).toLocaleString()}</time></li>`
            )
            .join('')
        : '<li class="muted">No activity yet</li>';
    }
    if (storeList) {
      const data = await apiJson(`/auth/history/store/${session.store_number}`);
      const managers = data.managers || [];
      storeList.innerHTML = managers.length
        ? managers
            .map(
              (m) =>
                `<li><strong>${m.username}</strong> — ${m.last_action} <time>${new Date(m.last_access_at).toLocaleString()}</time></li>`
            )
            .join('')
        : '<li class="muted">No store access recorded yet</li>';
    }
  } catch (err) {
    console.warn('Could not load activity:', err);
  }
}
