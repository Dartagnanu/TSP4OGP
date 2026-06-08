import bcrypt from 'bcrypt';
import Manager from '../models/manager.js';
import Store from '../models/store.js';

/**
 * Create default dev managers if none exist. Does not reset existing passwords.
 */
export async function ensureDefaultManagers() {
  const existing = await Manager.findOne({ username: 'manager' });
  if (existing) {
    return { created: false };
  }

  const stores = await Store.find({}).select('store_number').lean();
  const storeNumbers = stores.map((s) => s.store_number).filter(Number.isFinite);
  const allowed = storeNumbers.length > 0 ? storeNumbers : [3260];

  const managerHash = await bcrypt.hash('manager', 10);
  await Manager.findOneAndUpdate(
    { username: 'manager' },
    {
      username: 'manager',
      password_hash: managerHash,
      allowed_store_numbers: allowed,
      display_name: 'Store Manager',
      active: true,
    },
    { upsert: true, new: true }
  );

  const manager1Hash = await bcrypt.hash('manager1', 10);
  await Manager.findOneAndUpdate(
    { username: 'manager1' },
    {
      username: 'manager1',
      password_hash: manager1Hash,
      allowed_store_numbers: allowed,
      display_name: 'Regional Manager',
      active: true,
    },
    { upsert: true, new: true }
  );

  console.log(
    'Default managers ensured (manager/manager, manager1/manager1) for stores:',
    allowed
  );
  return { created: true, allowed_store_numbers: allowed };
}
