# TSP4OGP

A collaborative store map editor with a GPU-backed pathfinding service for pickwalk routing (GTSP-style heuristics).

## Quick start (Docker)

From the repo root:

```bash
docker compose up -d mongo app gtsp-server
```

Seed demo data for store **3260** (required on a fresh database). The full seed also creates store **3261**:

```bash
docker compose --profile seed run --rm seed
```

Add or refresh **store 3261 only** (Walmart-style 1000×600 ft layout; does not wipe 3260):

```bash
docker compose --profile seed-3261 run --rm seed-3261
```

- **Store editor:** http://localhost:42069  
- **Pathfinder API:** http://localhost:5000  

## Store editor login

The map editor requires a manager login before any store data or edits are available. Sessions are stored in the browser **sessionStorage** (cleared when the tab closes) and sent as `Authorization: Bearer <token>` on API and Socket.io requests.

### Default accounts

On first startup (when no `manager` user exists), the app creates:

| Username | Password | Stores |
|----------|----------|--------|
| `manager` | `manager` | All stores in Mongo, or `3260` if none exist |
| `manager1` | `manager1` | Same as above |

Log in with username, password, and the **store number** you want to edit (`3260` small demo map, `3261` big-box). A manager can only open stores listed on their account. On startup the app merges every store in Mongo into `allowed_store_numbers` for the default managers.

### Store 3261 layout (Walmart-style prototype)

- **Map:** 1000×600 ft (10× store 3260). At overview zoom only major grid lines show; zoom in to reveal a viewport 1–10 ft minor grid.
- **Entrance:** `Main_Entrance` at front center `[500, 590]`; checkout registers at `[380, 598]` and `[620, 598]`.
- **Zones:** empty north/east/west perimeter bands; **central racetrack** (no gondolas, promo features inside); **west and east wings** with three aisle pairs each (15-bay runs, two row-blocks per aisle); **front action alley** promos behind the entrance; **endcaps** at the north/south end of each aisle pair.

### Login troubleshooting

- **Invalid username or password** — Restart the app so default managers are created (`docker compose restart app`). Check app logs for `Default managers ensured`.
- **Store not found** — Seed demo data: `docker compose --profile seed run --rm seed`.
- **Server error / blank response** — Install server deps: `cd store-editor/server && npm install`, or `docker compose build app`.
- **Cannot POST /auth/login** — The app container likely crashed: Windows `node_modules/bcrypt` must not be bind-mounted into Linux. Run `docker compose build app && docker compose up -d app` (compose uses a named volume for `store-editor/server/node_modules`).
- **Logged in but map empty** — Hard-refresh the browser; confirm store `3260` exists and the session store number matches.

### Auth API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | No | `{ username, password, store_number }` → session token |
| POST | `/auth/logout` | Bearer | Invalidate session |
| GET | `/auth/me` | Bearer | Current session profile |
| GET | `/auth/stores` | Bearer | Stores this manager may access |
| GET | `/auth/history/me?limit=50` | Bearer | Your activity log |
| GET | `/auth/history/store/:store_number` | Bearer | Per-store manager last-access summary + recent events |

Shelf create/update/delete/clone and store edits append to **AccessLog** and update **StoreAccessSummary** (last access per manager per store).

Rebuild the app image after pulling auth changes so `bcrypt` is installed: `docker compose build app`.

## Pathfinding (`POST /find-path`)

The gtsp-server builds a polygon-filled walkability grid from shelves (format `walkability_v2`), resolves **front-access** approach cells per shelf template, then returns an ordered pick list using a **GTSP solver** (exact for ≤12 UPCs; insertion + 2-opt + outlier relocation for 13–150). Items on the same shelf are batched into one walk leg but each item remains its own stop in the response.

### Request body (JSON)

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `store` | Yes | number | Store number (e.g. `3260`). Must exist in MongoDB `stores` with shelves and item indexes. |
| `upcs` | Yes | string[] | UPCs to pick, in any order. The server returns a **visit order**, not the input order. |
| `start` | No | `[x, y]` | Grid coordinates where the walk begins. If omitted, the first `starting_points[].point` on the store document is used. |
| `end` | No | `[x, y]` | Return destination after all picks. Only used when **`start` is also sent**; defaults to `start` for a round trip. If both are omitted, the store’s first starting point is used for start and end. |

**Examples**

Default (store’s first starting point, round trip):

```json
{
  "store": 3260,
  "upcs": ["0010001000001", "0020001000011"]
}
```

Custom entrance and checkout:

```json
{
  "store": 3260,
  "upcs": ["0010001000001", "0020001000011"],
  "start": [10, 50],
  "end": [40, 0]
}
```

`start` and `end` must be walkable grid cells (aisles / shelf access nodes). Distances are shortest-path steps on the store grid.

### Response body

JSON **array** of entries in visit order.

**Pick entry** (normal item):

| Field | Description |
|-------|-------------|
| `upc` | UPC picked at this stop |
| `item_name` | From item index |
| `shelf` | Shelf name |
| `shelf_data` | Shelf metadata (`placement_x`, `placement_y`, `template`, `department`, `modulars`, …) |
| `modular_location` | Position on shelf modular, if known |
| `location` | `[x, y]` shelf **approach** coordinate used for routing (aisle cell in front of shelf, not placement corner) |
| `distance_from_previous` | Grid distance from previous stop (`0` when `same_shelf_batch` is true) |
| `same_shelf_batch` | Optional; `true` when this item is consecutive with the prior stop at the same shelf |

**Unreachable entry** (no shelf location for this store):

| Field | Description |
|-------|-------------|
| `upc`, `item_name` | As above |
| `shelf` | `"unknown"` |
| `location` | `null` |
| `unreachable` | `true` |

**Return leg** (only when `end` differs from the last pick location):

| Field | Description |
|-------|-------------|
| `type` | `"return"` |
| `location` | `[x, y]` end point |
| `distance_from_previous` | Grid distance from last pick to `end` |

### How options are processed

1. **Store scope** — UPCs are resolved via `itemindexes` filtered by `store_number` (not global UPC lookup).
2. **Graph** — Walkability bitmap is loaded or built from shelves (`store_graphs`, format `walkability_v2`), with polygon-filled footprints and per-shelf access points. Cached per server with LRU limits.
3. **Ordering** — GTSP: pick best location per UPC when multiple exist; prioritize shelves with several items; exact DP (≤12 UPCs) or insertion + 2-opt (13–150); optional outlier relocation for multi-location items.
4. **Start / end** — If `start` and `end` are provided, routing begins at `start`; after picks, a return entry is appended when `end` is not the last pick location. If they are omitted, both default to the store’s first `starting_points` entry.

### Store editor integration

The client sends `start` / `end` when a pickwalk defines `starting_point` (and optional `end_point`):

- [`store-editor/client/js/controllers/pathFinder/walkFinder.js`](store-editor/client/js/controllers/pathFinder/walkFinder.js) → `POST` to `GTSP_SERVER_URL/find-path`
- Configure API URL in [`store-editor/client/config.js`](store-editor/client/config.js) (default `http://localhost:5000`)

**Map editor coordinates:** Shelf templates define arbitrary foot polygons in `shelf_templates.shape` (e.g. 4×2 ft rectangles). The canvas scales from each store’s `map_size`; placement snaps to a **1-foot** grid. Very large maps skip drawing every 1 ft line for performance.

**Shelf edits and routing:** UPC locations come from Mongo `itemindexes` (not shelf `modulars` alone). Saving or cloning a shelf runs itemindex sync from its modulars (supports both `modular_id` strings like `202` and ObjectIds stored on seeded shelves). Sync adds/updates that shelf’s index rows only; the pathfinder picks the **nearest** shelf among all `itemindexes` candidates. Clear modulars on a shelf and save to remove its index entries. Moving a shelf updates Mongo placement; gtsp-server reloads walkability when the per-store shelves hash changes (in-memory cache invalidation).

### Other gtsp-server endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/ping` | Health; reports pathfinder init status |
| `GET` | `/cache-stats` | In-process store cache (tiers, bytes) |
| `GET` | `/graph/<store_number>` | Graph export or walkability summary |
| `GET` | `/store/<number>` | Store document |
| `GET` | `/shelves?store=<number>` | Shelves for a store |

### Pathfinder tuning (environment variables)

Set on the `gtsp-server` container. Full list and ops notes: [`gtsp-server/OPERATIONS.md`](gtsp-server/OPERATIONS.md).

| Variable | Default | Effect |
|----------|---------|--------|
| `PATHFINDER_MAX_CACHED_STORES` | `50` | Max stores kept in memory per pod |
| `PATHFINDER_MAX_CACHE_MB` | `512` | Memory budget for store cache |
| `PATHFINDER_TIER_S_CELLS` | `10000` | Small-store walkable cell threshold |
| `PATHFINDER_TIER_M_CELLS` | `100000` | Medium-store threshold |
| `PATHFINDER_MATRIX_MAX_SHELVES` | `500` | Skip full shelf distance matrix above this count |
| `PATHFINDER_TWO_OPT_MAX_K` | `80` | Skip 2-opt when pick count exceeds this |
| `PATHFINDER_MAX_MAP_WIDTH` / `PATHFINDER_MAX_MAP_HEIGHT` | `2000` / `2500` | Reject oversized maps |

Dev override ([`docker-compose.override.yml`](docker-compose.override.yml)): bind-mounts `./gtsp-server` for live Python edits; `FLASK_DEBUG=1`, `FLASK_USE_RELOADER=0`.

## Development notes

- **Code-only changes (gtsp-server):** `docker compose restart gtsp-server` (no rebuild unless Dockerfile/deps change).
- **Image / deps change:** `docker compose build gtsp-server && docker compose up -d gtsp-server`
- **Mongo empty / 404 on `/store/3260`:** run the seed command above.
