import { buildStore3261Seed } from '../lib/layout3261.js';
import {
  clearStore3261Data,
  populateStoreFromSeed,
  upsertPickwalks,
} from './populateStoreFromSeed.js';
import { grantStore3261Access } from './syncManagerStoreAccess.js';

/**
 * Additive seed for store 3261 only (does not wipe store 3260 or 3262).
 */
export async function seedStore3261() {
  await clearStore3261Data();
  const data = buildStore3261Seed();
  const result = await populateStoreFromSeed(data);
  await upsertPickwalks(data.pickwalks);
  await grantStore3261Access();

  const standard = data.shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = data.shelves.filter((s) => s.template === 'feature_bin').length;
  console.log(
    `Store 3261 seeded: ${result.shelfCount} shelves (${standard} standard, ${features} feature), ` +
      `${data.modulars.length} modulars, ${data.items.length} items, ` +
      `${(data.pickwalks || []).length} pickwalks, map ${data.map_size.width}×${data.map_size.height} ft`
  );
  return result;
}
