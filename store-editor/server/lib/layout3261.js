/**
 * Walmart-style supercenter layout for store 3261 (1000×600 ft).
 * Gondola runs along Y; wings west/east of central racetrack.
 */

const STORE_NUMBER = 3261;
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;

const BAYS_PER_RUN = 15;
const BAY_PITCH = 4;
const RUN_LENGTH = BAYS_PER_RUN * BAY_PITCH;
const GONDOLA_DEPTH = 2;
const MERCH_AISLE = 12;
const CROSS_AISLE = 18;
const PAIR_PITCH_X = 30;

const WING_WEST_X0 = 80;
const WING_EAST_X0 = 550;
const AISLE_PAIRS_PER_WING = 3;

const BLOCK1_Y0 = 100;
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
  const x =
    side === 'west' ? xBase : xBase + GONDOLA_DEPTH + MERCH_AISLE;

  for (let bay = 1; bay <= BAYS_PER_RUN; bay += 1) {
    const y = yBase + (bay - 1) * BAY_PITCH;
    const name = `3261-${wingCode}${aisleIndex}-B${blockIndex}-${sideCode}${String(bay).padStart(2, '0')}`;
    shelves.push(makeStandardShelf(name, x, y, rot));
  }
}

function placeWing(shelves, wingCode, x0) {
  for (let aisle = 1; aisle <= AISLE_PAIRS_PER_WING; aisle += 1) {
    const xBase = x0 + (aisle - 1) * PAIR_PITCH_X;
    const aisleCenterX = xBase + GONDOLA_DEPTH + MERCH_AISLE / 2;

    for (const block of [1, 2]) {
      const yBase = block === 1 ? BLOCK1_Y0 : BLOCK2_Y0;
      placeRun(shelves, wingCode, aisle, block, 'west', xBase, yBase);
      placeRun(shelves, wingCode, aisle, block, 'east', xBase, yBase);
    }

    const pairNorthY = BLOCK1_Y0 - 4;
    const pairSouthY = BLOCK2_Y0 + RUN_LENGTH;
    shelves.push(
      makeFeatureShelf(`3261-${wingCode}${aisle}-ECAP-N`, aisleCenterX - 2, pairNorthY, 0)
    );
    shelves.push(
      makeFeatureShelf(`3261-${wingCode}${aisle}-ECAP-S`, aisleCenterX - 2, pairSouthY, 0)
    );
  }
}

function placeRacetrackFeatures(shelves) {
  const xs = [500];
  const ys = [220, 280, 340, 400];
  ys.forEach((y, i) => {
    shelves.push(makeFeatureShelf(`3261-RT-PROMO-${i + 1}`, xs[0] - 2, y, 0));
  });
}

function placeFrontActionAlley(shelves) {
  const y = 545;
  const xs = [420, 440, 460, 480, 520, 540, 560, 580];
  xs.forEach((x, i) => {
    shelves.push(makeFeatureShelf(`3261-FRONT-PROMO-${i + 1}`, x, y, 0));
  });
}

function placeCrossAisleFeatures(shelves) {
  const spots = [
    [200, 200],
    [800, 200],
    [200, 360],
    [800, 360],
  ];
  spots.forEach(([x, y], i) => {
    shelves.push(makeFeatureShelf(`3261-CROSS-${i + 1}`, x, y, 0));
  });
}

function placeNorthPerimeterFeatures(shelves) {
  shelves.push(makeFeatureShelf('3261-BACK-PROMO-1', 480, 28, 0));
  shelves.push(makeFeatureShelf('3261-BACK-PROMO-2', 520, 28, 0));
}

export function buildStore3261Seed() {
  const shelves = [];
  placeWing(shelves, 'W', WING_WEST_X0);
  placeWing(shelves, 'E', WING_EAST_X0);
  placeRacetrackFeatures(shelves);
  placeFrontActionAlley(shelves);
  placeCrossAisleFeatures(shelves);
  placeNorthPerimeterFeatures(shelves);

  const demoModulars = [
    {
      modular_id: '3261-001',
      modular: 1,
      modular_section: 1,
      items: [
        { location: 1, item_number: 2000001 },
        { location: 2, item_number: 2000002 },
      ],
    },
  ];

  const demoItems = [
    {
      item_number: 2000001,
      upcs: ['0032612000001'],
      name: 'Trail Mix',
      department: 'grocery',
      photo: '',
      price: 4.99,
      pickwalk: 'ambient',
    },
    {
      item_number: 2000002,
      upcs: ['0032612000002'],
      name: 'Bottled Water 24pk',
      department: 'grocery',
      photo: '',
      price: 3.99,
      pickwalk: 'ambient',
    },
  ];

  const demoShelf = shelves.find((s) => s.shelf_name === '3261-W1-B1-W01');
  if (demoShelf) demoShelf.modulars = ['3261-001'];

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
    starting_points: [{ id: 'Main_Entrance', point: [500, 590] }],
    registers: [
      { id: 'Checkout_West', point: [380, 598] },
      { id: 'Checkout_East', point: [620, 598] },
    ],
    shelves,
    modulars: demoModulars,
    items: demoItems,
  };
}
