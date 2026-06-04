/** Clone using modulars as returned from GET /shelves (ObjectId strings from seed). */
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
  const shelves = await (await fetch(`${EDITOR}/shelves?store=${STORE}`)).json();
  const src = shelves.find((s) => s.shelf_name === 'shelf_001');
  if (!src) throw new Error('shelf_001 missing');
  console.log('source modulars from API:', src.modulars);

  const cloneName = `shelf_003_oid_${Date.now()}`;
  const cloneRes = await fetch(`${EDITOR}/shelf/shelf_001/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_number: STORE,
      shelf_name: cloneName,
      placement_x: 12,
      placement_y: 48,
      modulars: src.modulars,
    }),
  });
  const body = await cloneRes.json();
  console.log('clone sync:', body.itemIndexesSynced);
  if (body.itemIndexesSynced?.modularsMissing?.length) {
    console.error('FAIL modularsMissing');
    process.exitCode = 1;
    return;
  }
  const pick = (await findPath()).find((p) => p.upc === UPC);
  console.log('picked shelf:', pick?.shelf, 'expected near', cloneName);
  const ok = pick?.shelf === cloneName;
  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
