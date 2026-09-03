import { buildStore3260Seed } from '../lib/layout3260.js';
import { populateStoreFromSeed, upsertPickwalks } from './populateStoreFromSeed.js';

/**
 * Seed store 3260 from layout3260 (used by the full seed after a global wipe).
 * Does not delete other stores.
 */
export async function seedStore3260() {
  const data = buildStore3260Seed();
  const result = await populateStoreFromSeed(data);
  await upsertPickwalks(data.pickwalks);

  const standard = data.shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = data.shelves.filter((s) => s.template === 'feature_bin').length;
  console.log(
    `Store 3260 seeded: ${result.shelfCount} shelves (${standard} standard, ${features} feature), ` +
      `${data.modulars.length} modulars, ${data.items.length} items, ` +
      `${(data.pickwalks || []).length} pickwalks, map ${data.map_size.width}×${data.map_size.height} ft`
  );
  return result;
}
