import { buildStore3261Seed } from '../lib/layout3261.js';
import {
  clearStore3261Data,
  populateStoreFromSeed,
} from './populateStoreFromSeed.js';
import { grantStore3261Access } from './syncManagerStoreAccess.js';

/**
 * Additive seed for store 3261 only (does not wipe store 3260).
 */
export async function seedStore3261() {
  await clearStore3261Data();
  const data = buildStore3261Seed();
  const result = await populateStoreFromSeed(data);
  await grantStore3261Access();
  console.log(
    `Store 3261 seeded: ${result.shelfCount} shelves, map ${data.map_size.width}×${data.map_size.height} ft`
  );
  return result;
}
