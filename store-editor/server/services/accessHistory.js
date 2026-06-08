import AccessLog from '../models/accessLog.js';
import StoreAccessSummary from '../models/storeAccessSummary.js';

export async function recordAccess({ username, store_number, action, summary, metadata = {} }) {
  await AccessLog.create({
    username,
    store_number,
    action,
    summary,
    metadata,
  });

  const now = new Date();
  const entry = { username, last_access_at: now, last_action: action };

  let doc = await StoreAccessSummary.findOne({ store_number });
  if (!doc) {
    doc = new StoreAccessSummary({ store_number, managers: [entry] });
    await doc.save();
    return;
  }

  const idx = doc.managers.findIndex((m) => m.username === username);
  if (idx >= 0) {
    doc.managers[idx] = entry;
  } else {
    doc.managers.push(entry);
  }
  await doc.save();
}
