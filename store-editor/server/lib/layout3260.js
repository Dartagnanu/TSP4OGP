/**
 * Compact 3262-style layout for store 3260.
 * West/east gondola wings with a racetrack. 15-bay runs, 6-cell merch
 * aisles, flush back-to-back gondolas. Map is grown just enough for the
 * 60 ft runs plus endcaps and a walkable entrance. Every gondola bay gets
 * its own modular and unique SKU so Test Walks can use the full aisle length.
 */

import {
  TEST_MERCH,
  buildTestMerchandising,
  summarizeTestMerch,
} from './testMerchandising.js';

const STORE_NUMBER = 3260;
const MAP_WIDTH = 100;
const MAP_HEIGHT = 84;
const ITEM_NUMBER_START = 1000001;
const START_POINT = { id: 'Main_Entrance', point: [50, 78] };

const BAYS_PER_RUN = 15;
const BAY_PITCH = 4;
const RUN_LENGTH = BAYS_PER_RUN * BAY_PITCH;
const GONDOLA_DEPTH = 2;
const MERCH_AISLE = 6;
const PAIR_PITCH_X = GONDOLA_DEPTH + MERCH_AISLE + GONDOLA_DEPTH;
const AISLE_PAIRS_PER_WING = 2;

const WING_WEST_X0 = 8;
const WING_EAST_X0 = 54;
const BLOCK1_Y0 = 6;

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

function placeRun(shelves, wingCode, aisleIndex, side, xBase, yBase) {
  const sideCode = side === 'west' ? 'W' : 'E';
  const rot = side === 'west' ? 90 : 270;
  const x = side === 'west' ? xBase : xBase + GONDOLA_DEPTH + MERCH_AISLE;

  for (let bay = 1; bay <= BAYS_PER_RUN; bay += 1) {
    const y = yBase + (bay - 1) * BAY_PITCH;
    const name = `3260-${wingCode}${aisleIndex}-B1-${sideCode}${String(bay).padStart(2, '0')}`;
    shelves.push(makeStandardShelf(name, x, y, rot));
  }
}

function placeWing(shelves, wingCode, x0) {
  for (let aisle = 1; aisle <= AISLE_PAIRS_PER_WING; aisle += 1) {
    const xBase = x0 + (aisle - 1) * PAIR_PITCH_X;
    placeRun(shelves, wingCode, aisle, 'west', xBase, BLOCK1_Y0);
    placeRun(shelves, wingCode, aisle, 'east', xBase, BLOCK1_Y0);
  }
}

function aisleCenterX(x0, aisle) {
  const xBase = x0 + (aisle - 1) * PAIR_PITCH_X;
  return xBase + GONDOLA_DEPTH + MERCH_AISLE / 2;
}

function placeFeatures(shelves) {
  const northY = BLOCK1_Y0 - 6;
  const southY = BLOCK1_Y0 + RUN_LENGTH;
  const wings = [
    ['W', WING_WEST_X0],
    ['E', WING_EAST_X0],
  ];
  wings.forEach(([code, x0]) => {
    for (let aisle = 1; aisle <= AISLE_PAIRS_PER_WING; aisle += 1) {
      const x = aisleCenterX(x0, aisle) - 2;
      shelves.push(makeFeatureShelf(`3260-${code}${aisle}-ECAP-N`, x, northY, 0));
      shelves.push(makeFeatureShelf(`3260-${code}${aisle}-ECAP-S`, x, southY, 0));
    }
  });

  const racetrackXs = [32, 40];
  const racetrackYs = [18, 34, 50];
  racetrackYs.forEach((y, yi) => {
    racetrackXs.forEach((x, xi) => {
      shelves.push(makeFeatureShelf(`3260-RT-PROMO-${yi * racetrackXs.length + xi + 1}`, x, y, 0));
    });
  });

  const frontY = 72;
  const frontXs = [10, 26, 38, 62, 76, 88];
  frontXs.forEach((x, i) => {
    shelves.push(makeFeatureShelf(`3260-FRONT-PROMO-${i + 1}`, x, frontY, 0));
  });
}

export function buildStore3260Seed() {
  const shelves = [];
  placeWing(shelves, 'W', WING_WEST_X0);
  placeWing(shelves, 'E', WING_EAST_X0);
  placeFeatures(shelves);

  const { modulars, items, pickwalks } = buildTestMerchandising(shelves, {
    storeNumber: STORE_NUMBER,
    itemNumberStart: ITEM_NUMBER_START,
    modularIdPrefix: '3260-',
    startPoint: START_POINT,
    pickwalkIdPrefix: 'pickwalk_3260_',
    onePerStandardShelf: true,
    itemsPerModular: 1,
    includeMultiLocation: false,
    oneUpcPerModularInWalks: true,
  });

  const standard = shelves.filter((s) => s.template === 'standard_shelf').length;
  const features = shelves.filter((s) => s.template === 'feature_bin').length;
  const assigned = shelves.filter((s) => (s.modulars || []).length === 1).length;
  const doubled = shelves.filter((s) => (s.modulars || []).length > 1).length;
  if (features !== TEST_MERCH.FEATURE_COUNT) {
    throw new Error(`Store 3260 expected ${TEST_MERCH.FEATURE_COUNT} feature shelves, got ${features}`);
  }
  if (assigned !== standard || doubled) {
    throw new Error(
      `Store 3260 expected one modular on each of ${standard} standard shelves, got ${assigned} assigned and ${doubled} with extras`
    );
  }

  return {
    store_number: STORE_NUMBER,
    name: 'Demo Store 3260',
    location: 'Demo Compact',
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
    registers: [{ id: 'Checkout_1', point: [50, 82] }],
    shelves,
    modulars,
    items,
    pickwalks,
  };
}

export function summarizeStore3260Seed(data = buildStore3260Seed()) {
  return summarizeTestMerch(data);
}
