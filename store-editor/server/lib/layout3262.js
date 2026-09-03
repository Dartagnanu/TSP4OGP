/**
 * Dense Walmart-style layout for store 3262 (500×300 ft).
 * Same gondola/racetrack pattern as 3261: 15-bay runs, 6-cell merch
 * aisles, flush back-to-back gondolas, packed for a dense test store.
 * Shared 40-modular / 160-SKU merchandising. Item numbers start at 3000001.
 */

import {
  TEST_MERCH,
  buildTestMerchandising,
  summarizeTestMerch,
} from './testMerchandising.js';

const STORE_NUMBER = 3262;
const MAP_WIDTH = 500;
const MAP_HEIGHT = 300;
const ITEM_NUMBER_START = 3000001;
const START_POINT = { id: 'Main_Entrance', point: [250, 290] };

const BAYS_PER_RUN = 15;
const BAY_PITCH = 4;
const RUN_LENGTH = BAYS_PER_RUN * BAY_PITCH;
const GONDOLA_DEPTH = 2;
const MERCH_AISLE = 6;
const CROSS_AISLE = 12;
const PAIR_PITCH_X = GONDOLA_DEPTH + MERCH_AISLE + GONDOLA_DEPTH;

const WING_WEST_X0 = 12;
const AISLE_PAIRS_PER_WING = 22;
const RACETRACK_GAP = 32;
const WING_EAST_X0 = WING_WEST_X0 + AISLE_PAIRS_PER_WING * PAIR_PITCH_X + RACETRACK_GAP;

const BLOCK1_Y0 = 40;
const BLOCK2_Y0 = BLOCK1_Y0 + RUN_LENGTH + CROSS_AISLE;

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

/** West run faces +X (rotation 90); east run faces -X (rotation 270). */
function placeRun(shelves, wingCode, aisleIndex, blockIndex, side, xBase, yBase) {
  const sideCode = side === 'west' ? 'W' : 'E';
  const rot = side === 'west' ? 90 : 270;
  const x = side === 'west' ? xBase : xBase + GONDOLA_DEPTH + MERCH_AISLE;

  for (let bay = 1; bay <= BAYS_PER_RUN; bay += 1) {
    const y = yBase + (bay - 1) * BAY_PITCH;
    const name = `3262-${wingCode}${aisleIndex}-B${blockIndex}-${sideCode}${String(bay).padStart(2, '0')}`;
    shelves.push(makeStandardShelf(name, x, y, rot));
  }
}

function placeWing(shelves, wingCode, x0) {
  for (let aisle = 1; aisle <= AISLE_PAIRS_PER_WING; aisle += 1) {
    const xBase = x0 + (aisle - 1) * PAIR_PITCH_X;
    for (const block of [1, 2]) {
      const yBase = block === 1 ? BLOCK1_Y0 : BLOCK2_Y0;
      placeRun(shelves, wingCode, aisle, block, 'west', xBase, yBase);
      placeRun(shelves, wingCode, aisle, block, 'east', xBase, yBase);
    }
  }
}

function placeFeatures(shelves) {
  const westWingEndX = WING_WEST_X0 + AISLE_PAIRS_PER_WING * PAIR_PITCH_X;
  const racetrackX = westWingEndX + Math.floor(RACETRACK_GAP / 2) - 2;
  const racetrackYs = [48, 72, 96, 120, 144, 168];
  racetrackYs.forEach((y, i) => {
    shelves.push(makeFeatureShelf(`3262-RT-PROMO-${i + 1}`, racetrackX, y, 0));
  });

  const frontY = 250;
  const frontXs = [80, 140, 200, 280, 340, 400];
  frontXs.forEach((x, i) => {
    shelves.push(makeFeatureShelf(`3262-FRONT-PROMO-${i + 1}`, x, frontY, 0));
  });

  const crossY = BLOCK1_Y0 + RUN_LENGTH + 4;
  const crossSpots = [
    [40, crossY],
    [120, crossY],
    [300, crossY],
    [400, crossY],
  ];
  crossSpots.forEach(([x, y], i) => {
    shelves.push(makeFeatureShelf(`3262-CROSS-${i + 1}`, x, y, 0));
  });

  shelves.push(makeFeatureShelf('3262-BACK-PROMO-1', racetrackX - 12, 16, 0));
  shelves.push(makeFeatureShelf('3262-BACK-PROMO-2', racetrackX + 12, 16, 0));

  const westEndcapX = WING_WEST_X0 + GONDOLA_DEPTH + MERCH_AISLE / 2 - 2;
  const eastEndcapX = WING_EAST_X0 + GONDOLA_DEPTH + MERCH_AISLE / 2 - 2;
  shelves.push(makeFeatureShelf('3262-W1-ECAP-N', westEndcapX, BLOCK1_Y0 - 4, 0));
  shelves.push(makeFeatureShelf('3262-E1-ECAP-N', eastEndcapX, BLOCK1_Y0 - 4, 0));
}

export function buildStore3262Seed() {
  const shelves = [];
  placeWing(shelves, 'W', WING_WEST_X0);
  placeWing(shelves, 'E', WING_EAST_X0);
  placeFeatures(shelves);

  const { modulars, items, pickwalks } = buildTestMerchandising(shelves, {
    storeNumber: STORE_NUMBER,
    itemNumberStart: ITEM_NUMBER_START,
    modularIdPrefix: '3262-',
    startPoint: START_POINT,
    pickwalkIdPrefix: 'pickwalk_3262_',
  });

  const standard = shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = shelves.filter((s) => s.template === 'feature_bin').length;
  if (standard < TEST_MERCH.MODULAR_COUNT) {
    throw new Error(
      `Store 3262 expected at least ${TEST_MERCH.MODULAR_COUNT} standard shelves, got ${standard}`
    );
  }
  if (features !== TEST_MERCH.FEATURE_COUNT) {
    throw new Error(`Store 3262 expected ${TEST_MERCH.FEATURE_COUNT} feature shelves, got ${features}`);
  }
  if (items.length !== TEST_MERCH.TOTAL_ITEMS) {
    throw new Error(`Store 3262 expected ${TEST_MERCH.TOTAL_ITEMS} items, got ${items.length}`);
  }

  return {
    store_number: STORE_NUMBER,
    name: 'Dense Test Store 3262',
    location: 'Demo Supercenter Compact',
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
    registers: [
      { id: 'Checkout_West', point: [200, 298] },
      { id: 'Checkout_East', point: [300, 298] },
    ],
    shelves,
    modulars,
    items,
    pickwalks,
  };
}

export function summarizeStore3262Seed(data = buildStore3262Seed()) {
  return summarizeTestMerch(data);
}
