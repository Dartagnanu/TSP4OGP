import { buildStore3262Seed } from '../lib/layout3262.js';
import {
  clearStore3262Data,
  populateStoreFromSeed,
  upsertPickwalks,
} from './populateStoreFromSeed.js';
import { grantStore3262Access } from './syncManagerStoreAccess.js';

/**
 * Additive seed for store 3262 only (does not wipe store 3260 or 3261).
 */
export async function seedStore3262() {
  await clearStore3262Data();
  const data = buildStore3262Seed();
  const result = await populateStoreFromSeed(data);
  await upsertPickwalks(data.pickwalks);
  await grantStore3262Access();

  const standard = data.shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = data.shelves.filter((s) => s.template === 'feature_bin').length;
  console.log(
    `Store 3262 seeded: ${result.shelfCount} shelves (${standard} standard, ${features} feature), ` +
      `${data.modulars.length} modulars, ${data.items.length} items, ` +
      `map ${data.map_size.width}×${data.map_size.height} ft`
  );
  return result;
}
