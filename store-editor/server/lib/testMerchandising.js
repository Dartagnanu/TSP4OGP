/**
 * Shared 160-SKU test merchandising: 40 modulars (3 SKUs each), 4 items
 * with 10 locations, 36 flex SKUs on 20 feature shelves, and named walks.
 */

export const TEST_MERCH = {
  MODULAR_COUNT: 40,
  ITEMS_PER_MODULAR: 3,
  MULTI_LOCATION_COUNT: 4,
  MULTI_LOCATION_SHELVES: 10,
  FLEX_SKU_COUNT: 36,
  FEATURE_COUNT: 20,
  TOTAL_ITEMS: 160,
  WALK_SIZES: [100, 80, 60, 20],
};

const DEPARTMENTS = ['grocery', 'snacks', 'beverages', 'household', 'personal_care'];

const PRODUCT_NAMES = [
  'Pasta', 'Rice', 'Beans', 'Cereal', 'Oats', 'Flour', 'Sugar', 'Salt',
  'Pepper', 'Canola Oil', 'Olive Oil', 'Vinegar', 'Pasta Sauce', 'Soup',
  'Broth', 'Crackers', 'Chips', 'Pretzels', 'Popcorn', 'Nuts',
  'Trail Mix', 'Granola', 'Cookies', 'Candy', 'Chocolate', 'Soda',
  'Sparkling Water', 'Juice', 'Tea Bags', 'Coffee', 'Paper Towels',
  'Toilet Paper', 'Dish Soap', 'Laundry Detergent', 'Trash Bags', 'Sponges',
  'Shampoo', 'Conditioner', 'Toothpaste', 'Soap',
];

const CUSTOMERS = ['Alex Rivera', 'Jordan Lee', 'Sam Patel', 'Casey Nguyen'];

function pad3(n) {
  return String(n).padStart(3, '0');
}

export function makeStoreUpc(storeNumber, seq) {
  return `00${storeNumber}3${String(seq).padStart(6, '0')}`;
}

export function productItemName(seq, storeNumber) {
  const base = PRODUCT_NAMES[(seq - 1) % PRODUCT_NAMES.length];
  const pack = Math.floor((seq - 1) / PRODUCT_NAMES.length) + 1;
  return pack === 1 ? `${base} ${storeNumber}` : `${base} ${pack}-Pack ${storeNumber}`;
}

function itemNumberForSeq(itemNumberStart, seq) {
  return itemNumberStart + seq - 1;
}

function makeItem(itemNumberStart, makeUpc, seq, name, department, pickwalk = 'ambient') {
  return {
    item_number: itemNumberForSeq(itemNumberStart, seq),
    upcs: [makeUpc(seq)],
    name,
    department,
    photo: '',
    price: Number((1.29 + (seq % 50) * 0.2).toFixed(2)),
    pickwalk,
  };
}

/** One modular per shelf, round-robin across X so small walks already span the floor. */
function selectOneModularHosts(standardShelves, count) {
  const columns = new Map();
  for (const shelf of standardShelves) {
    const x = shelf.placement_x;
    if (!columns.has(x)) columns.set(x, []);
    columns.get(x).push(shelf);
  }
  const xs = [...columns.keys()].sort((a, b) => a - b);
  for (const x of xs) {
    columns.get(x).sort((a, b) => a.placement_y - b.placement_y);
  }

  const hosts = [];
  const used = new Set();
  const maxRows = Math.max(0, ...xs.map((x) => columns.get(x).length));
  for (let row = 0; row < maxRows && hosts.length < count; row += 1) {
    for (const x of xs) {
      if (hosts.length >= count) break;
      const shelf = columns.get(x)[row];
      if (!shelf || used.has(shelf.shelf_name)) continue;
      used.add(shelf.shelf_name);
      hosts.push(shelf);
    }
  }

  if (hosts.length < count) {
    throw new Error(
      `Need ${count} empty standard shelves for modulars, only placed ${hosts.length}`
    );
  }
  return hosts;
}

function sampleWalkUpcs(primaryUpcs, extraUpcs, size) {
  if (size <= 0) return [];
  const extras = extraUpcs.filter((upc) => !primaryUpcs.includes(upc));
  if (size >= primaryUpcs.length) {
    return [...primaryUpcs, ...extras].slice(0, size);
  }
  if (size === 1) return [primaryUpcs[0]];
  const out = [];
  const used = new Set();
  for (let i = 0; i < size; i += 1) {
    const idx = Math.round((i * (primaryUpcs.length - 1)) / (size - 1));
    let pick = primaryUpcs[idx];
    if (used.has(pick)) {
      pick = primaryUpcs.find((u) => !used.has(u));
    }
    if (!pick) break;
    used.add(pick);
    out.push(pick);
  }
  return out;
}

/**
 * Mutates shelves (modulars + flex_items) and returns modulars, items, pickwalks.
 */
export function buildTestMerchandising(shelves, options) {
  const {
    storeNumber,
    itemNumberStart,
    modularIdPrefix,
    startPoint,
    pickwalkIdPrefix,
    makeUpc = (seq) => makeStoreUpc(storeNumber, seq),
    itemNameFn = (seq) => productItemName(seq, storeNumber),
    onePerStandardShelf = false,
    itemsPerModular,
    includeMultiLocation = true,
    oneUpcPerModularInWalks = false,
  } = options;

  const {
    MODULAR_COUNT: DEFAULT_MODULAR_COUNT,
    ITEMS_PER_MODULAR,
    MULTI_LOCATION_COUNT,
    MULTI_LOCATION_SHELVES,
    FLEX_SKU_COUNT,
    FEATURE_COUNT,
    TOTAL_ITEMS,
    WALK_SIZES,
  } = TEST_MERCH;

  const standardShelves = shelves.filter((s) => s.template === 'standard_shelf');
  const featureShelves = shelves.filter((s) => s.template === 'feature_bin');
  const modularCount = onePerStandardShelf ? standardShelves.length : DEFAULT_MODULAR_COUNT;
  const slotsPerModular = itemsPerModular ?? ITEMS_PER_MODULAR;
  const multiCount = includeMultiLocation ? MULTI_LOCATION_COUNT : 0;

  if (standardShelves.length < modularCount) {
    throw new Error(
      `Store ${storeNumber} needs at least ${modularCount} standard shelves, got ${standardShelves.length}`
    );
  }
  if (featureShelves.length < FEATURE_COUNT) {
    throw new Error(
      `Store ${storeNumber} needs at least ${FEATURE_COUNT} feature shelves, got ${featureShelves.length}`
    );
  }

  const modulars = [];
  const items = [];
  const modularUpcs = [];
  const firstUpcPerModular = [];
  const hosts = selectOneModularHosts(standardShelves, modularCount);

  const multiStartSeq = modularCount * slotsPerModular + 1;
  const flexStartSeq = multiStartSeq + multiCount;

  for (let m = 0; m < modularCount; m += 1) {
    const modularNum = m + 1;
    const modular_id = `${modularIdPrefix}${pad3(modularNum)}`;
    const host = hosts[m];
    if ((host.modulars || []).length) {
      throw new Error(`Shelf ${host.shelf_name} already has a modular; test merch is one per shelf`);
    }
    host.modulars = [modular_id];

    const modularItems = [];
    for (let slot = 0; slot < slotsPerModular; slot += 1) {
      const seq = m * slotsPerModular + slot + 1;
      const department = DEPARTMENTS[m % DEPARTMENTS.length];
      items.push(makeItem(itemNumberStart, makeUpc, seq, itemNameFn(seq), department));
      const upc = makeUpc(seq);
      modularUpcs.push(upc);
      if (slot === 0) firstUpcPerModular.push(upc);
      modularItems.push({ location: slot + 1, item_number: itemNumberForSeq(itemNumberStart, seq) });
    }

    if (multiCount > 0) {
      const extraGroup = Math.floor(m / MULTI_LOCATION_SHELVES);
      const extraSeq = multiStartSeq + extraGroup;
      modularItems.push({
        location: slotsPerModular + 1,
        item_number: itemNumberForSeq(itemNumberStart, extraSeq),
      });
    }

    modulars.push({
      modular_id,
      modular: modularNum,
      modular_section: 1,
      items: modularItems,
    });
  }

  for (let i = 0; i < multiCount; i += 1) {
    const seq = multiStartSeq + i;
    items.push(
      makeItem(
        itemNumberStart,
        makeUpc,
        seq,
        `Multi-Location ${String.fromCharCode(65 + i)} ${storeNumber}`,
        'grocery'
      )
    );
  }

  const flexUpcs = [];
  for (let i = 0; i < FLEX_SKU_COUNT; i += 1) {
    const seq = flexStartSeq + i;
    items.push(
      makeItem(itemNumberStart, makeUpc, seq, `Feature Flex ${i + 1} ${storeNumber}`, 'promo')
    );
    flexUpcs.push(makeUpc(seq));
  }

  let flexSeq = flexStartSeq;
  featureShelves.slice(0, FEATURE_COUNT).forEach((shelf, idx) => {
    const count = idx < 16 ? 2 : 1;
    const flexItems = [];
    for (let n = 0; n < count; n += 1) {
      flexItems.push(itemNumberForSeq(itemNumberStart, flexSeq));
      flexSeq += 1;
    }
    shelf.flex_items = flexItems;
  });

  const walkPrimary = oneUpcPerModularInWalks ? firstUpcPerModular : modularUpcs;
  const pickwalks = WALK_SIZES.map((size) => {
    const walkUpcs = oneUpcPerModularInWalks
      ? sampleWalkUpcs(walkPrimary, flexUpcs, size)
      : modularUpcs.slice(0, size);
    return {
      pickwalk_id: `${pickwalkIdPrefix}${size}`,
      name: `${size} SKU ambient`,
      store_id: storeNumber,
      pickwalk_subtype: 'ambient',
      starting_point: { id: startPoint.id, point: [...startPoint.point] },
      itemList: walkUpcs.map((upc, i) => ({
        upc,
        quantity: (i % 3) + 1,
        customer: CUSTOMERS[i % CUSTOMERS.length],
        shelf: null,
        ordered_number: null,
      })),
      dueDate: new Date('2026-12-31T17:00:00Z'),
      dueTime: '17:00',
    };
  });

  if (!onePerStandardShelf && items.length !== TOTAL_ITEMS) {
    throw new Error(`Store ${storeNumber} expected ${TOTAL_ITEMS} items, got ${items.length}`);
  }
  if (modulars.length !== modularCount) {
    throw new Error(`Store ${storeNumber} expected ${modularCount} modulars, got ${modulars.length}`);
  }

  return { modulars, items, pickwalks };
}

export function summarizeTestMerch(data) {
  const standard = data.shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = data.shelves.filter((s) => s.template === 'feature_bin').length;
  const featuresWithFlex = data.shelves.filter(
    (s) => s.template === 'feature_bin' && (s.flex_items || []).length > 0
  ).length;
  const flexSkuCount = data.shelves.reduce(
    (n, s) => n + (s.template === 'feature_bin' ? (s.flex_items || []).length : 0),
    0
  );
  const assignedModulars = data.shelves.filter((s) => (s.modulars || []).length > 0).length;
  return {
    store: data.store_number,
    map: `${data.map_size.width}×${data.map_size.height}`,
    shelves: data.shelves.length,
    standard,
    features,
    featuresWithFlex,
    flexSkuCount,
    modulars: data.modulars.length,
    assignedModulars,
    items: data.items.length,
    pickwalks: (data.pickwalks || []).map((p) => `${p.name}:${p.itemList.length}`),
  };
}
