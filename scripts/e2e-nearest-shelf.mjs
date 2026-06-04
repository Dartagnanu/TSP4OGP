/**
 * E2E: with two shelves in itemindex, pathfinder picks the nearer shelf.
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
  if (!res.ok) throw new Error(`find-path ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const list = data.pick_list || data;
  const pick = list.find((p) => p.upc === UPC);
  return {
    shelf: pick?.shelf || pick?.shelf_data?.shelf_name,
    location: pick?.location,
    distance: pick?.distance_from_previous,
  };
}

async function putShelf(name, placement_x, placement_y, modulars) {
  const res = await fetch(`${EDITOR}/shelf/${name}/store/${STORE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: name,
      store_number: STORE,
      placement_x,
      placement_y,
      modulars,
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });
  if (!res.ok) throw new Error(`PUT ${name} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function createShelf(name, placement_x, placement_y, modulars) {
  const res = await fetch(`${EDITOR}/shelf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: name,
      store_number: STORE,
      placement_x,
      placement_y,
      modulars,
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });
  if (res.status === 201) return res.json();
  if (res.status === 500 && (await res.text()).includes('duplicate')) {
    return putShelf(name, placement_x, placement_y, modulars);
  }
  if (!res.ok) throw new Error(`POST ${name} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function cloneShelf(sourceName, cloneName, placement_x, placement_y) {
  const res = await fetch(`${EDITOR}/shelf/${sourceName}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_number: STORE,
      shelf_name: cloneName,
      placement_x,
      placement_y,
      modulars: ['203'],
    }),
  });
  if (!res.ok) throw new Error(`clone ${res.status}: ${await res.text()}`);
  return res.json();
}

async function deleteShelf(name) {
  const res = await fetch(`${EDITOR}/shelf/${name}/store/${STORE}`, {
    method: 'DELETE',
  });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`DELETE ${name} ${res.status}`);
}

async function cleanupE2eShelves() {
  const res = await fetch(`${EDITOR}/shelves?store=${STORE}`);
  if (!res.ok) return;
  const shelves = await res.json();
  const re = /shelf_(close|far|003_e2e|003_empty)/i;
  for (const s of shelves) {
    if (re.test(s.shelf_name)) {
      await deleteShelf(s.shelf_name);
    }
  }
}

async function main() {
  await cleanupE2eShelves();
  await putShelf('shelf_003', 50, 50, []);

  const ts = Date.now();
  const closeName = `shelf_close_${ts}`;
  const farName = `shelf_far_${ts}`;

  await createShelf(closeName, 11, 49, ['203']);
  console.log('close shelf', closeName, 'at [11,49] with modular 203');

  const cloneBody = await cloneShelf(closeName, farName, 85, 5);
  console.log('far clone', farName, 'at [85,5] sync:', cloneBody.itemIndexesSynced);

  const pick = await findPath();
  console.log('picked:', pick);
  console.log('expected close shelf:', closeName);

  const distClose =
    Math.abs(pick.location[0] - 11) + Math.abs(pick.location[1] - 49);
  const distFar = Math.abs(pick.location[0] - 85) + Math.abs(pick.location[1] - 5);

  if (pick.shelf !== closeName || distClose >= distFar) {
    console.error('FAIL: did not pick nearer shelf');
    process.exitCode = 1;
  } else {
    console.log('PASS: nearest shelf chosen');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
