import Manager from '../models/manager.js';
import Store from '../models/store.js';

/**
 * Merge every store_number in Mongo into manager allowed_store_numbers.
 */
export async function syncManagerStoreAccess() {
  const stores = await Store.find({}).select('store_number').lean();
  const storeNumbers = stores.map((s) => s.store_number).filter(Number.isFinite);
  if (storeNumbers.length === 0) return { updated: false, storeNumbers: [] };

  await Manager.updateMany(
    { username: { $in: ['manager', 'manager1'] } },
    { $addToSet: { allowed_store_numbers: { $each: storeNumbers } } }
  );

  return { updated: true, storeNumbers };
}

export async function grantStore3261Access() {
  await Manager.updateMany(
    { username: { $in: ['manager', 'manager1'] } },
    { $addToSet: { allowed_store_numbers: 3261 } }
  );
}
