/**
 * Mimics UI context-menu clone: source +10,+10, same modulars, no drag.
 */
const STORE = 3260;
const UPC = '0030001000022';
const START = [10, 50];
const EDITOR = 'http://127.0.0.1:42069';
const GTSP = 'http://127.0.0.1:5000';

async function findPath() {
  const res = await fetch(`${GTSP}/find-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: STORE, upcs: [UPC], start: START, end: START }),
  });
  const data = await res.json();
  const list = data.pick_list || data;
  return list.find((p) => p.upc === UPC);
}

async function put(name, x, y, modulars) {
  const res = await fetch(`${EDITOR}/shelf/${name}/store/${STORE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: name,
      store_number: STORE,
      placement_x: x,
      placement_y: y,
      modulars,
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });
  if (!res.ok) throw new Error(`PUT ${res.status}`);
  return res.json();
}

async function main() {
  await put('shelf_003', 11, 49, ['203']);
  const cloneName = `shelf_003_copy_${Date.now()}`;
  const res = await fetch(`${EDITOR}/shelf/shelf_003/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_number: STORE,
      shelf_name: cloneName,
      placement_x: 21,
      placement_y: 59,
      modulars: ['203'],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));

  const pick = await findPath();
  console.log('clone at [21,59] (UI +10 offset), source [11,49]');
  console.log('pick:', pick?.shelf, pick?.location, 'dist', pick?.distance_from_previous);
  console.log('sync:', body.itemIndexesSynced);

  if (pick?.shelf !== 'shelf_003') {
    console.error('FAIL: expected nearer shelf_003, got', pick?.shelf);
    process.exitCode = 1;
  } else {
    console.log('PASS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
