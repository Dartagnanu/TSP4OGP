import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import Manager from '../models/manager.js';
import Session from '../models/session.js';
import Store from '../models/store.js';
import AccessLog from '../models/accessLog.js';
import StoreAccessSummary from '../models/storeAccessSummary.js';
import { recordAccess } from '../services/accessHistory.js';
import { requireAuth } from '../middleware/auth.js';
import { debugLog } from '../lib/debugLog.js';

const SESSION_HOURS = 12;

const router = Router();

function sessionExpiry() {
  return new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
}

router.post('/login', async (req, res) => {
  try {
    debugLog('auth.js:login', 'login attempt', { hasBody: !!req.body }, 'D');
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const store_number = Number(req.body?.store_number);

    if (!username || !password || !store_number || Number.isNaN(store_number)) {
      return res.status(400).send({ error: 'username, password, and store_number are required' });
    }

    const manager = await Manager.findOne({ username, active: true });
    if (!manager) {
      return res.status(401).send({ error: 'Invalid username or password' });
    }

    const passwordOk = await bcrypt.compare(password, manager.password_hash);
    if (!passwordOk) {
      return res.status(401).send({ error: 'Invalid username or password' });
    }

    if (!manager.allowed_store_numbers.includes(store_number)) {
      return res.status(403).send({ error: 'You do not have access to this store' });
    }

    const store = await Store.findOne({ store_number });
    if (!store) {
      return res.status(404).send({ error: 'Store not found' });
    }

    const token = crypto.randomUUID();
    await Session.create({
      token,
      username: manager.username,
      store_number,
      expires_at: sessionExpiry(),
    });

    await recordAccess({
      username: manager.username,
      store_number,
      action: 'login',
      summary: `Logged in to store ${store_number}`,
    });

    debugLog('auth.js:login', 'login success', { username: manager.username, store_number }, 'D');
    res.send({
      token,
      username: manager.username,
      display_name: manager.display_name || manager.username,
      store_number,
      allowed_store_numbers: manager.allowed_store_numbers,
    });
  } catch (err) {
    debugLog('auth.js:login', 'login error', { err: err.message }, 'C');
    res.status(500).send({ error: err.message });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await Session.deleteOne({ token: req.auth.token });
    await recordAccess({
      username: req.auth.username,
      store_number: req.auth.store_number,
      action: 'logout',
      summary: `Logged out from store ${req.auth.store_number}`,
    });
    res.send({ status: 'ok' });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.send({
    username: req.auth.username,
    display_name: req.auth.display_name,
    store_number: req.auth.store_number,
    allowed_store_numbers: req.auth.allowed_store_numbers,
  });
});

router.get('/stores', requireAuth, async (req, res) => {
  try {
    const stores = await Store.find({
      store_number: { $in: req.auth.allowed_store_numbers },
    }).select('store_number map_size');
    res.send(
      stores.map((s) => ({
        store_number: s.store_number,
        map_size: s.map_size,
      }))
    );
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

router.get('/history/me', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const logs = await AccessLog.find({ username: req.auth.username })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
    res.send(logs);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

router.get('/history/store/:store_number', requireAuth, async (req, res) => {
  try {
    const store_number = Number(req.params.store_number);
    if (Number.isNaN(store_number)) {
      return res.status(400).send({ error: 'Invalid store number' });
    }
    if (!req.auth.allowed_store_numbers.includes(store_number)) {
      return res.status(403).send({ error: 'You do not have access to this store' });
    }

    const summary = await StoreAccessSummary.findOne({ store_number }).lean();
    const recent = await AccessLog.find({ store_number })
      .sort({ created_at: -1 })
      .limit(20)
      .lean();

    res.send({
      store_number,
      managers: summary?.managers || [],
      recent_activity: recent,
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

export default router;
