import Store from '../models/store.js';
import Shelf from '../models/shelf.js';
import Item from '../models/item.js';
import Modular from '../models/modular.js';
import ItemIndex from '../models/itemIndex.js';
import Pickwalk from '../models/pickwalk.js';

/**
 * Upsert one store and related shelves/modulars/items from a dataseed-shaped payload.
 * @param {object} data
 * @param {{ storeNumber?: number }} [options]
 */
export async function populateStoreFromSeed(data, options = {}) {
  const storeNumber = options.storeNumber ?? data.store_number;
  if (!storeNumber || !data.shelves) {
    throw new Error('Seed payload missing store_number or shelves.');
  }

  const store = await Store.findOneAndUpdate(
    { store_number: storeNumber },
    {
      name: data.name,
      location: data.location,
      map_size: data.map_size,
      store_shape: data.store_shape,
      walls: data.walls ?? [],
      shelf_templates: data.shelf_templates,
      starting_points: data.starting_points,
      registers: data.registers,
    },
    { upsert: true, new: true }
  );

  const modularIdMap = {};
  if ((data.modulars || []).length) {
    await Modular.bulkWrite(
      data.modulars.map((modular) => ({
        updateOne: {
          filter: { modular_id: modular.modular_id },
          update: { $set: { ...modular } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    const modDocs = await Modular.find({
      modular_id: { $in: data.modulars.map((m) => m.modular_id) },
    })
      .select('_id modular_id')
      .lean();
    for (const doc of modDocs) modularIdMap[doc.modular_id] = doc._id;
  }

  const shelfIdMap = {};
  if (data.shelves.length) {
    await Shelf.bulkWrite(
      data.shelves.map((shelf) => {
        const modulars = (shelf.modulars || []).map((id) => modularIdMap[id]).filter(Boolean);
        return {
          updateOne: {
            filter: { shelf_name: shelf.shelf_name, store_number: shelf.store_number },
            update: {
              $set: {
                ...shelf,
                store: store._id,
                modulars: shelf.modulars?.length ? modulars : shelf.modulars || [],
              },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false }
    );
    const shelfDocs = await Shelf.find({ store_number: storeNumber }).select('_id shelf_name').lean();
    for (const doc of shelfDocs) shelfIdMap[doc.shelf_name] = doc._id;
  }

  if ((data.items || []).length) {
    await Item.bulkWrite(
      data.items.map((item) => ({
        updateOne: {
          filter: { item_number: item.item_number },
          update: { $set: { ...item } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  const itemLocationMap = {};
  for (const modular of data.modulars || []) {
    for (const modItem of modular.items || []) {
      for (const shelf of data.shelves) {
        if ((shelf.modulars || []).includes(modular.modular_id)) {
          if (!itemLocationMap[modItem.item_number]) itemLocationMap[modItem.item_number] = [];
          itemLocationMap[modItem.item_number].push({
            shelf_name: shelfIdMap[shelf.shelf_name],
            location: modItem.location,
          });
        }
      }
    }
  }

  // Pathfinder reads itemindexes, not shelf.flex_items — index flex SKUs onto their feature shelves.
  for (const shelf of data.shelves) {
    for (const itemNumber of shelf.flex_items || []) {
      if (!itemLocationMap[itemNumber]) itemLocationMap[itemNumber] = [];
      itemLocationMap[itemNumber].push({
        shelf_name: shelfIdMap[shelf.shelf_name],
        location: null,
      });
    }
  }

  const indexOps = [];
  for (const item of data.items || []) {
    const upcs = Array.isArray(item.upcs) ? item.upcs : [item.upc].filter(Boolean);
    for (const upc of upcs) {
      indexOps.push({
        updateOne: {
          filter: { store: store.store_number.toString(), upcs: upc },
          update: {
            $set: {
              store: store.store_number.toString(),
              store_number: store.store_number,
              item_number: item.item_number,
              upcs: [upc],
              locations: itemLocationMap[item.item_number] || [],
              price: item.price,
              photo: item.photo,
              name: item.name,
              pickwalk: item.pickwalk,
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (indexOps.length) {
    await ItemIndex.bulkWrite(indexOps, { ordered: false });
  }

  await Store.updateOne(
    { store_number: store.store_number },
    { $set: { updatedAt: new Date() } }
  );

  return { store, shelfCount: data.shelves.length };
}

/**
 * Remove store-scoped shelves, modulars, item indexes, and item-number range.
 */
export async function clearStoreScopedData({
  storeNumber,
  modularPrefix,
  itemNumberMin,
  itemNumberMax,
  clearPickwalks = false,
}) {
  await Shelf.deleteMany({ store_number: storeNumber });
  await Modular.deleteMany({ modular_id: modularPrefix });
  await ItemIndex.deleteMany({ store_number: storeNumber });
  await Item.deleteMany({ item_number: { $gte: itemNumberMin, $lt: itemNumberMax } });
  if (clearPickwalks) {
    await Pickwalk.deleteMany({ store_id: storeNumber });
  }
}

/**
 * Upsert pickwalk documents by pickwalk_id + store_id.
 */
export async function upsertPickwalks(pickwalks) {
  for (const pickwalk of pickwalks || []) {
    await Pickwalk.findOneAndUpdate(
      { pickwalk_id: pickwalk.pickwalk_id, store_id: pickwalk.store_id },
      pickwalk,
      { upsert: true, new: true }
    );
  }
}

/**
 * Remove store 3261 scoped documents before re-seed.
 */
export async function clearStore3261Data() {
  await clearStoreScopedData({
    storeNumber: 3261,
    modularPrefix: /^3261-/,
    itemNumberMin: 2000000,
    itemNumberMax: 3000000,
    clearPickwalks: true,
  });
}

/**
 * Remove store 3262 scoped documents before re-seed.
 */
export async function clearStore3262Data() {
  await clearStoreScopedData({
    storeNumber: 3262,
    modularPrefix: /^3262-/,
    itemNumberMin: 3000000,
    itemNumberMax: 4000000,
    clearPickwalks: true,
  });
}
