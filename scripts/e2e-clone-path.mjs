/**
 * E2E: clone shelf_003, move clone near start, find-path for bananas UPC.
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
  return res.json();
}

function pickShelf(result) {
  const pick = (result.pick_list || result).find((p) => p.upc === UPC);
  return pick?.shelf || pick?.shelf_data?.shelf_name;
}

async function resetShelf003() {
  const res = await fetch(`${EDITOR}/shelf/shelf_003/store/${STORE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: 'shelf_003',
      store_number: STORE,
      placement_x: 15,
      placement_y: 10,
      modulars: ['203'],
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });
  if (!res.ok) throw new Error(`reset shelf_003 ${res.status}`);
}

async function main() {
  const ping = await fetch(`${GTSP}/ping`);
  if (!ping.ok) throw new Error('gtsp-server not up');
  console.log('gtsp ping ok');

  await resetShelf003();
  console.log('reset shelf_003 to seed placement');

  const before = await findPath();
  const beforeShelf = pickShelf(before);
  console.log('before clone:', beforeShelf);

  const cloneName = `shelf_003_e2e_${Date.now()}`;
  const cloneRes = await fetch(`${EDITOR}/shelf/shelf_003/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_number: STORE,
      shelf_name: cloneName,
      placement_x: 11,
      placement_y: 49,
      modulars: ['203'],
    }),
  });
  if (!cloneRes.ok) throw new Error(`clone ${cloneRes.status}: ${await cloneRes.text()}`);
  const cloneBody = await cloneRes.json();
  console.log('clone sync:', cloneBody.itemIndexesSynced);

  const afterClone = await findPath();
  console.log('after clone:', pickShelf(afterClone));

  const putRes = await fetch(`${EDITOR}/shelf/${cloneName}/store/${STORE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: cloneName,
      store_number: STORE,
      placement_x: 11,
      placement_y: 49,
      modulars: ['203'],
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });
  if (!putRes.ok) throw new Error(`put ${putRes.status}`);
  console.log('put sync:', (await putRes.json()).itemIndexesSynced);

  const clearOrig = await fetch(`${EDITOR}/shelf/shelf_003/store/${STORE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: 'shelf_003',
      store_number: STORE,
      placement_x: 50,
      placement_y: 50,
      modulars: [],
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });
  if (!clearOrig.ok) throw new Error(`clear orig ${clearOrig.status}`);
  console.log('clear orig sync:', (await clearOrig.json()).itemIndexesSynced);

  const after = await findPath();
  const afterShelf = pickShelf(after);
  console.log('after reassignment:', afterShelf, 'expected', cloneName);
  if (afterShelf !== cloneName) {
    process.exitCode = 1;
    console.error('FAIL: pathfinder did not pick clone');
  } else {
    console.log('PASS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
