/**
 * Store 3261 demonstration: supermarket corridor blocks on 1000×600.
 * Grocery runs are only 15 or 6 bays; registers (block Z) are 3-bay vertical
 * corridors at the front. Facing matches live 3260 (front = local +Y).
 */

import {
  TEST_MERCH,
  buildTestMerchandising,
  summarizeTestMerch,
} from './testMerchandising.js';

const STORE_NUMBER = 3261;
const ITEM_NUMBER_START = 2100001;
const START_POINT = { id: 'Main_Entrance', point: [500, 590] };
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;

const BAY_PITCH = 4;
const GONDOLA_DEPTH = 2;
const MERCH_AISLE = 6;
const COLUMN_PITCH = GONDOLA_DEPTH + MERCH_AISLE + GONDOLA_DEPTH;
const ORIGIN_ALIGN = 4;

const GROCERY_BAYS = new Set([15, 6]);
const REGISTER_BAYS = 3;

const SHELF_TEMPLATES = {
  standard_shelf: {
    shape: [
      [0, 0],
      [0, 2],
      [4, 2],
      [4, 0],
    ],
    access: 'front',
    color: '#b0c4de',
  },
  feature_bin: {
    shape: [
      [0, 0],
      [0, 4],
      [4, 4],
      [4, 0],
    ],
    access: 'all_sides',
    color: '#ffa500',
  },
};

function snap(n) {
  return Math.round(n);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function assertBayCount(bayCount, blockLetter) {
  if (blockLetter === 'Z') {
    if (bayCount !== REGISTER_BAYS) {
      throw new Error(`Register block Z only allows ${REGISTER_BAYS} bays, got ${bayCount}`);
    }
    return;
  }
  if (!GROCERY_BAYS.has(bayCount)) {
    throw new Error(`Grocery block ${blockLetter} only allows 15 or 6 bays, got ${bayCount}`);
  }
}

function makeStandardShelf(name, placement_x, placement_y, rotation, department = 'general') {
  return {
    store_number: STORE_NUMBER,
    shelf_name: name,
    template: 'standard_shelf',
    placement_x: snap(placement_x),
    placement_y: snap(placement_y),
    rotation,
    flex_items: [],
    modulars: [],
    department,
  };
}

function makeFeatureShelf(name, placement_x, placement_y, rotation = 0, department = 'promo') {
  return {
    store_number: STORE_NUMBER,
    shelf_name: name,
    template: 'feature_bin',
    placement_x: snap(placement_x),
    placement_y: snap(placement_y),
    rotation,
    flex_items: [],
    modulars: [],
    department,
  };
}

/** Double-sided vertical gondola: 90° faces −X, 270° faces +X (into adjacent aisles). */
function placeVerticalGondolaColumn(shelves, { x, y0, bayCount, blockLetter, colIndex, department }) {
  for (let bay = 1; bay <= bayCount; bay += 1) {
    const y90 = y0 + (bay - 1) * BAY_PITCH;
    const y270 = y90 + ORIGIN_ALIGN;
    const prefix = `3261-${blockLetter}-C${pad2(colIndex)}`;
    shelves.push(makeStandardShelf(`${prefix}-W${pad2(bay)}`, x, y90, 90, department));
    shelves.push(makeStandardShelf(`${prefix}-E${pad2(bay)}`, x, y270, 270, department));
  }
}

/**
 * Continuous vertical field: corridorCount aisles, corridorCount+1 gondola columns.
 */
function placeVerticalBlock(shelves, { x0, y0, corridorCount, bayCount, blockLetter, department = 'general', colIndexStart = 1 }) {
  assertBayCount(bayCount, blockLetter);
  if (corridorCount < 1) {
    throw new Error(`Block ${blockLetter} needs at least 1 corridor`);
  }
  const columnCount = corridorCount + 1;
  for (let col = 1; col <= columnCount; col += 1) {
    placeVerticalGondolaColumn(shelves, {
      x: x0 + (col - 1) * COLUMN_PITCH,
      y0,
      bayCount,
      blockLetter,
      colIndex: colIndexStart + col - 1,
      department,
    });
  }
}

/** Double-sided horizontal gondola: 0° faces +Y, 180° faces −Y. */
function placeHorizontalGondolaRow(shelves, { y, x0, bayCount, blockLetter, rowIndex, department }) {
  for (let bay = 1; bay <= bayCount; bay += 1) {
    const x0face = x0 + (bay - 1) * BAY_PITCH;
    const x180 = x0face + ORIGIN_ALIGN;
    const prefix = `3261-${blockLetter}-R${pad2(rowIndex)}`;
    shelves.push(makeStandardShelf(`${prefix}-S${pad2(bay)}`, x0face, y, 0, department));
    shelves.push(makeStandardShelf(`${prefix}-N${pad2(bay)}`, x180, y, 180, department));
  }
}

function placeHorizontalBlock(shelves, { y0, x0, corridorCount, bayCount, blockLetter, department = 'general' }) {
  assertBayCount(bayCount, blockLetter);
  if (corridorCount < 1) {
    throw new Error(`Block ${blockLetter} needs at least 1 corridor`);
  }
  const rowCount = corridorCount + 1;
  for (let row = 1; row <= rowCount; row += 1) {
    placeHorizontalGondolaRow(shelves, {
      y: y0 + (row - 1) * COLUMN_PITCH,
      x0,
      bayCount,
      blockLetter,
      rowIndex: row,
      department,
    });
  }
}

function placeFeatures(shelves) {
  const spots = [
    [50, 112],
    [70, 112],
    [90, 112],
    [110, 112],
    [140, 112],
    [180, 112],
    [400, 80],
    [450, 80],
    [760, 80],
    [820, 80],
    [80, 200],
    [150, 200],
    [500, 250],
    [500, 320],
    [500, 400],
    [500, 480],
    [300, 520],
    [400, 520],
    [600, 520],
    [700, 520],
  ];
  if (spots.length !== TEST_MERCH.FEATURE_COUNT) {
    throw new Error(`Store 3261 expected ${TEST_MERCH.FEATURE_COUNT} feature spots, got ${spots.length}`);
  }
  spots.forEach(([x, y], i) => {
    shelves.push(makeFeatureShelf(`3261-PROMO-${pad2(i + 1)}`, x, y, 0));
  });
}

function parseShelfName(name) {
  const m = name.match(/^3261-([A-Z])-(C|R)(\d{2})-([WESN])(\d{2})$/);
  if (!m) {
    throw new Error(`Unexpected 3261 shelf name: ${name}`);
  }
  return {
    block: m[1],
    kind: m[2],
    index: Number(m[3]),
    side: m[4],
    bay: Number(m[5]),
  };
}

function assertLayoutGeometry(shelves) {
  if (COLUMN_PITCH !== GONDOLA_DEPTH + MERCH_AISLE + GONDOLA_DEPTH) {
    throw new Error('3261 column pitch must be 2+6+2');
  }
  const standard = shelves.filter((s) => s.template === 'standard_shelf');
  const byCol = new Map();
  const byRow = new Map();
  for (const s of standard) {
    const p = parseShelfName(s.shelf_name);
    if (p.kind === 'C') {
      const key = `${p.block}-${p.index}`;
      if (!byCol.has(key)) {
        byCol.set(key, { block: p.block, index: p.index, x: s.placement_x, bays: new Set(), rots: {} });
      }
      const col = byCol.get(key);
      if (col.x !== s.placement_x) {
        throw new Error(`Column ${key} has mixed placement_x`);
      }
      col.bays.add(p.bay);
      col.rots[p.side] = s.rotation;
      if (p.side === 'W' && s.rotation !== 90) {
        throw new Error(`${s.shelf_name} west face must be 90°`);
      }
      if (p.side === 'E' && s.rotation !== 270) {
        throw new Error(`${s.shelf_name} east face must be 270°`);
      }
    } else {
      const key = `${p.block}-${p.index}`;
      if (!byRow.has(key)) {
        byRow.set(key, { block: p.block, index: p.index, y: s.placement_y, bays: new Set() });
      }
      const row = byRow.get(key);
      if (row.y !== s.placement_y) {
        throw new Error(`Row ${key} has mixed placement_y`);
      }
      row.bays.add(p.bay);
      if (p.side === 'S' && s.rotation !== 0) {
        throw new Error(`${s.shelf_name} south face must be 0°`);
      }
      if (p.side === 'N' && s.rotation !== 180) {
        throw new Error(`${s.shelf_name} north face must be 180°`);
      }
    }
  }

  const columnsByBlock = new Map();
  for (const col of byCol.values()) {
    if (!columnsByBlock.has(col.block)) {
      columnsByBlock.set(col.block, []);
    }
    columnsByBlock.get(col.block).push(col);
    const bayCount = col.bays.size;
    if (col.block === 'Z') {
      if (bayCount !== REGISTER_BAYS) {
        throw new Error(`Register column ${col.block}-${col.index} has ${bayCount} bays`);
      }
    } else if (!GROCERY_BAYS.has(bayCount)) {
      throw new Error(`Grocery column ${col.block}-${col.index} has ${bayCount} bays`);
    }
  }
  for (const [block, cols] of columnsByBlock) {
    cols.sort((a, b) => a.x - b.x);
    for (let i = 1; i < cols.length; i += 1) {
      const dx = cols[i].x - cols[i - 1].x;
      if (dx !== COLUMN_PITCH) {
        if (block !== 'Z') {
          throw new Error(`Block ${block} column Δx=${dx}, expected ${COLUMN_PITCH}`);
        }
        continue;
      }
      const facingGap = dx - 2 * GONDOLA_DEPTH;
      if (facingGap !== MERCH_AISLE) {
        throw new Error(`Block ${block} facing gap ${facingGap}, expected ${MERCH_AISLE}`);
      }
    }
  }

  const rowsByBlock = new Map();
  for (const row of byRow.values()) {
    if (!rowsByBlock.has(row.block)) {
      rowsByBlock.set(row.block, []);
    }
    rowsByBlock.get(row.block).push(row);
    if (!GROCERY_BAYS.has(row.bays.size)) {
      throw new Error(`Grocery row ${row.block}-${row.index} has ${row.bays.size} bays`);
    }
  }
  for (const [block, rows] of rowsByBlock) {
    rows.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i += 1) {
      const dy = rows[i].y - rows[i - 1].y;
      if (dy !== COLUMN_PITCH) {
        throw new Error(`Block ${block} row Δy=${dy}, expected ${COLUMN_PITCH}`);
      }
      const facingGap = dy - 2 * GONDOLA_DEPTH;
      if (facingGap !== MERCH_AISLE) {
        throw new Error(`Block ${block} horizontal facing gap ${facingGap}, expected ${MERCH_AISLE}`);
      }
    }
  }

  const start = START_POINT.point;
  for (const s of shelves.filter((sh) => sh.template === 'feature_bin')) {
    if (
      start[0] >= s.placement_x &&
      start[0] < s.placement_x + 4 &&
      start[1] >= s.placement_y &&
      start[1] < s.placement_y + 4
    ) {
      throw new Error(`Start ${start} overlaps feature ${s.shelf_name}`);
    }
  }
}

function registerPointsForBlock({ x0, corridorCount, y, idPrefix }) {
  const points = [];
  for (let i = 1; i <= corridorCount; i += 1) {
    const x = x0 + (i - 1) * COLUMN_PITCH + 5;
    points.push({ id: `${idPrefix}${pad2(i)}`, point: [x, y] });
  }
  return points;
}

export function buildStore3261Seed() {
  const shelves = [];

  placeVerticalBlock(shelves, {
    x0: 40,
    y0: 40,
    corridorCount: 12,
    bayCount: 15,
    blockLetter: 'A',
  });
  placeVerticalBlock(shelves, {
    x0: 40,
    y0: 130,
    corridorCount: 9,
    bayCount: 6,
    blockLetter: 'B',
  });
  placeHorizontalBlock(shelves, {
    y0: 40,
    x0: 220,
    corridorCount: 9,
    bayCount: 15,
    blockLetter: 'C',
  });
  placeHorizontalBlock(shelves, {
    y0: 40,
    x0: 320,
    corridorCount: 6,
    bayCount: 6,
    blockLetter: 'D',
  });
  placeVerticalBlock(shelves, {
    x0: 500,
    y0: 40,
    corridorCount: 20,
    bayCount: 15,
    blockLetter: 'E',
  });

  const zWest = { x0: 200, y0: 548, corridorCount: 6, bayCount: 3, blockLetter: 'Z', department: 'checkout' };
  const zEast = { x0: 560, y0: 548, corridorCount: 6, bayCount: 3, blockLetter: 'Z', department: 'checkout' };
  placeVerticalBlock(shelves, zWest);
  placeVerticalBlock(shelves, { ...zEast, colIndexStart: 20 });

  placeFeatures(shelves);
  assertLayoutGeometry(shelves);

  const { modulars, items, pickwalks } = buildTestMerchandising(shelves, {
    storeNumber: STORE_NUMBER,
    itemNumberStart: ITEM_NUMBER_START,
    modularIdPrefix: '3261-',
    startPoint: START_POINT,
    pickwalkIdPrefix: 'pickwalk_3261_',
  });

  const standard = shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = shelves.filter((s) => s.template === 'feature_bin').length;
  if (standard < TEST_MERCH.MODULAR_COUNT) {
    throw new Error(
      `Store 3261 expected at least ${TEST_MERCH.MODULAR_COUNT} standard shelves, got ${standard}`
    );
  }
  if (features !== TEST_MERCH.FEATURE_COUNT) {
    throw new Error(`Store 3261 expected ${TEST_MERCH.FEATURE_COUNT} feature shelves, got ${features}`);
  }
  if (items.length !== TEST_MERCH.TOTAL_ITEMS) {
    throw new Error(`Store 3261 expected ${TEST_MERCH.TOTAL_ITEMS} items, got ${items.length}`);
  }

  const registers = [
    ...registerPointsForBlock({ x0: zWest.x0, corridorCount: zWest.corridorCount, y: 582, idPrefix: 'Checkout_W' }),
    ...registerPointsForBlock({ x0: zEast.x0, corridorCount: zEast.corridorCount, y: 582, idPrefix: 'Checkout_E' }),
  ];

  return {
    store_number: STORE_NUMBER,
    name: 'Big Box Store 3261',
    location: 'Demo Supercenter',
    map_size: { width: MAP_WIDTH, height: MAP_HEIGHT },
    store_shape: [
      [0, 0],
      [0, MAP_HEIGHT],
      [MAP_WIDTH, MAP_HEIGHT],
      [MAP_WIDTH, 0],
    ],
    walls: [],
    shelf_templates: SHELF_TEMPLATES,
    starting_points: [START_POINT],
    registers,
    shelves,
    modulars,
    items,
    pickwalks,
  };
}

export function summarizeStore3261Seed(data = buildStore3261Seed()) {
  return summarizeTestMerch(data);
}
