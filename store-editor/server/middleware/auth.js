import Session from '../models/session.js';
import Manager from '../models/manager.js';

export async function loadSessionFromToken(token) {
  if (!token) return null;
  const session = await Session.findOne({ token, expires_at: { $gt: new Date() } });
  if (!session) return null;
  const manager = await Manager.findOne({ username: session.username, active: true });
  if (!manager) return null;
  return { session, manager };
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const loaded = await loadSessionFromToken(token);
    if (!loaded) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    req.auth = {
      token,
      username: loaded.session.username,
      store_number: loaded.session.store_number,
      display_name: loaded.manager.display_name || loaded.session.username,
      allowed_store_numbers: loaded.manager.allowed_store_numbers || [],
    };
    req.sessionDoc = loaded.session;
    req.manager = loaded.manager;
    next();
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
}

/** Ensure request targets the store for the current login session. */
export function requireSessionStore(req, res, next) {
  const sessionStore = req.auth?.store_number;
  if (!sessionStore) {
    return res.status(401).send({ error: 'Unauthorized' });
  }

  const candidates = [
    req.params.store_number,
    req.params.store_id,
    req.params.storeId,
    req.params.number,
    req.body?.store_number,
    req.body?.store_id,
    req.query?.store,
  ]
    .filter((v) => v != null && v !== '')
    .map((v) => Number(v));

  for (const n of candidates) {
    if (!Number.isNaN(n) && n !== sessionStore) {
      return res.status(403).send({
        error: `Access denied for store ${n}. Log in to store ${sessionStore} to continue.`,
      });
    }
  }
  next();
}

export function setupSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const loaded = await loadSessionFromToken(token);
      if (!loaded) {
        return next(new Error('Unauthorized'));
      }
      socket.data.auth = {
        username: loaded.session.username,
        store_number: loaded.session.store_number,
      };
      next();
    } catch (err) {
      next(err);
    }
  });
}
