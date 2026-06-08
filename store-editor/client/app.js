import { Sidebar } from './js/controllers/sidebar/sidebar.js';
import { mapController } from './js/controllers/mapController.js';
import { KonvaPalette } from './js/konva/konvaPalette.js';
import { GTSP_SERVER_URL } from './config.js';
import { getToken } from './js/auth/session.js';
import {
  bindLoginForm,
  showLogin,
  validateSession,
  setLoginSuccessHandler,
  updateSessionDisplay,
  loadActivityPanels,
} from './js/auth/login.js';

let socket = null;
let mapCtrlInstance = null;

async function initApp(storeNumber) {
  if (socket) {
    socket.disconnect();
  }

  socket = io({
    auth: { token: getToken() },
  });

  const mapCtrl = new mapController(storeNumber, null, null, socket);
  await mapCtrl.init();

  window.mapController = mapCtrl;
  mapCtrlInstance = mapCtrl;

  new Sidebar();
  const palette = new KonvaPalette(mapCtrl);
  palette.init();
  mapCtrl.palette = palette;

  document.getElementById('testWalksBtn')?.addEventListener('click', () => {
    mapCtrl.testWalks();
  });

  document.getElementById('container')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  document.getElementById('refreshActivityBtn')?.addEventListener('click', () => {
    loadActivityPanels();
  });

  await loadActivityPanels();
  return mapCtrl;
}

async function bootstrap() {
  bindLoginForm();

  setLoginSuccessHandler(async (session) => {
    updateSessionDisplay(session);
    if (mapCtrlInstance) {
      socket?.disconnect();
      mapCtrlInstance = null;
    }
    await initApp(session.store_number);
  });

  window.addEventListener('auth:logout', () => {
    socket?.disconnect();
    mapCtrlInstance = null;
    showLogin('Session expired. Please log in again.');
  });

  const session = await validateSession();
  if (!session) {
    showLogin();
    return;
  }

  updateSessionDisplay(session);
  hideLoginFromBootstrap();
  await initApp(session.store_number);
}

function hideLoginFromBootstrap() {
  const overlay = document.getElementById('loginOverlay');
  const appShell = document.getElementById('appShell');
  if (overlay) overlay.classList.add('hidden');
  if (appShell) appShell.classList.remove('hidden');
}

bootstrap().catch((err) => {
  console.error(err);
  showLogin(err.message || 'Failed to start application');
});

fetch(`${GTSP_SERVER_URL}/ping`)
  .then((response) => response.json())
  .then((data) => {
    console.log('GTSP server is running:', data);
  })
  .catch((error) => {
    console.error('Error pinging GTSP server:', error);
  });
