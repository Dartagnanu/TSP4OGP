import Store from '../models/store.js';
import Shelf from '../models/shelf.js';
import Item from '../models/item.js';
import Modular from '../models/modular.js';
import ItemIndex from '../models/itemIndex.js';

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
  for (const modular of data.modulars || []) {
    const modDoc = await Modular.findOneAndUpdate(
      { modular_id: modular.modular_id },
      { ...modular },
      { upsert: true, new: true }
    );
    modularIdMap[modular.modular_id] = modDoc._id;
  }

  const shelfIdMap = {};
  for (const shelf of data.shelves) {
    const modulars = (shelf.modulars || []).map((id) => modularIdMap[id]).filter(Boolean);
    const shelfDoc = await Shelf.findOneAndUpdate(
      { shelf_name: shelf.shelf_name, store_number: shelf.store_number },
      {
        ...shelf,
        store: store._id,
        modulars: shelf.modulars?.length ? modulars : shelf.modulars || [],
      },
      { upsert: true, new: true }
    );
    shelfIdMap[shelf.shelf_name] = shelfDoc._id;
  }

  for (const item of data.items || []) {
    await Item.findOneAndUpdate({ item_number: item.item_number }, { ...item }, { upsert: true, new: true });
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

  for (const item of data.items || []) {
    const upcs = Array.isArray(item.upcs) ? item.upcs : [item.upc].filter(Boolean);
    for (const upc of upcs) {
      await ItemIndex.findOneAndUpdate(
        { store: store.store_number.toString(), upcs: upc },
        {
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
        { upsert: true, new: true }
      );
    }
  }

  return { store, shelfCount: data.shelves.length };
}

/**
 * Remove store 3261 scoped documents before re-seed.
 */
export async function clearStore3261Data() {
  const storeNumber = 3261;
  await Shelf.deleteMany({ store_number: storeNumber });
  await Modular.deleteMany({ modular_id: /^3261-/ });
  await ItemIndex.deleteMany({ store_number: storeNumber });
  await Item.deleteMany({ item_number: { $gte: 2000000, $lt: 3000000 } });
}
