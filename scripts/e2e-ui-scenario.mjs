/**
 * UI-like scenario: shelf_003 near start, clone far, Test Walks UPC.
 * Prints find-path pick + reads gtsp debug log candidates if present.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, '../debug-5bfbd6.log');
const STORE = 3260;
const UPC = '0030001000022';
const START = [10, 50];
const EDITOR = 'http://127.0.0.1:42069';
const GTSP = 'http://127.0.0.1:5000';

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
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PUT ${name} ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function clone(source, name, x, y) {
  const res = await fetch(`${EDITOR}/shelf/${source}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_number: STORE,
      shelf_name: name,
      placement_x: x,
      placement_y: y,
      modulars: ['203'],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clone ${res.status}`);
  return body;
}

async function findPath() {
  const res = await fetch(`${GTSP}/find-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: STORE, upcs: [UPC], start: START, end: START }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  const list = data.pick_list || data;
  return list.find((p) => p.upc === UPC);
}

function readGreedyFromLog() {
  if (!fs.existsSync(LOG)) return null;
  const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o.location?.includes('greedy_pick_sequence')) return o;
    } catch {
      /* skip */
    }
  }
  return null;
}

async function main() {
  try {
    fs.writeFileSync(LOG, '');
  } catch {
    /* ok */
  }

  const cloneName = `shelf_ui_${Date.now()}`;
  await put('shelf_003', 11, 49, ['203']);
  console.log('shelf_003 near [11,49] synced');
  const c = await clone('shelf_003', cloneName, 85, 5);
  console.log('clone far sync:', c.itemIndexesSynced);

  const pick = await findPath();
  console.log('pick:', {
    shelf: pick?.shelf,
    location: pick?.location,
    distance: pick?.distance_from_previous,
    placement: pick?.shelf_data
      ? [pick.shelf_data.placement_x, pick.shelf_data.placement_y]
      : null,
  });

  const log = readGreedyFromLog();
  if (log) {
    console.log('log candidates:', JSON.stringify(log.data?.candidates, null, 2));
    console.log('log chosen:', log.data?.chosen_shelf, 'dist', log.data?.chosen_distance);
  } else {
    console.log('no debug log at', LOG);
  }

  const ok = pick?.shelf === 'shelf_003';
  if (!ok) {
    console.error('FAIL expected shelf_003 near start');
    process.exitCode = 1;
  } else {
    console.log('PASS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
