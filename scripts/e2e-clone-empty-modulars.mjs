/** Clone with modulars:[] — must fall back to source shelf modulars and sync itemindex. */
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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function main() {
  await fetch(`${EDITOR}/shelf/shelf_003/store/${STORE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shelf_name: 'shelf_003',
      store_number: STORE,
      placement_x: 40,
      placement_y: 40,
      modulars: ['203'],
      template: 'standard_shelf',
      rotation: 0,
      department: 'produce',
    }),
  });

  const cloneName = `shelf_003_empty_${Date.now()}`;
  const cloneRes = await fetch(`${EDITOR}/shelf/shelf_003/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_number: STORE,
      shelf_name: cloneName,
      placement_x: 12,
      placement_y: 48,
      modulars: [],
    }),
  });
  const body = await cloneRes.json();
  console.log('clone sync:', body.itemIndexesSynced);
  const pick = (await findPath()).find((p) => p.upc === UPC);
  console.log('picked:', pick?.shelf, 'expected:', cloneName);
  const ok = pick?.shelf === cloneName;
  console.log(ok ? 'PASS empty-modulars fallback' : 'FAIL');
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
