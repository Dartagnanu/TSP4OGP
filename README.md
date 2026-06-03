# TSP4OGP

A collaborative store map editor with a GPU-backed pathfinding service for pickwalk routing (GTSP-style heuristics).

## Quick start (Docker)

From the repo root:

```bash
docker compose up -d mongo app gtsp-server
```

Seed demo data for store **3260** (required on a fresh database):

```bash
docker compose --profile seed run --rm seed
```

- **Store editor:** http://localhost:42069  
- **Pathfinder API:** http://localhost:5000  

## Pathfinding (`POST /find-path`)

The gtsp-server builds a walkability grid from the store layout and shelves, then returns an ordered pick list using a greedy nearest-neighbor heuristic (with optional 2-opt improvement on medium/large stores when a shelf distance matrix is available).

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
| `location` | `[x, y]` shelf access coordinate used for routing |
| `distance_from_previous` | Grid distance from previous stop |

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
2. **Graph** — Walkability bitmap is loaded or built from shelves (`store_graphs`, format `walkability_v1`), cached per server with LRU limits.
3. **Ordering** — Greedy nearest-neighbor on grid distances; optional shelf-to-shelf matrix + 2-opt on larger stores (see env vars below).
4. **Start / end** — If `start` and `end` are provided, routing begins at `start`; after picks, a return entry is appended when `end` is not the last pick location. If they are omitted, both default to the store’s first `starting_points` entry.

### Store editor integration

The client sends `start` / `end` when a pickwalk defines `starting_point` (and optional `end_point`):

- [`store-editor/client/js/controllers/pathFinder/walkFinder.js`](store-editor/client/js/controllers/pathFinder/walkFinder.js) → `POST` to `GTSP_SERVER_URL/find-path`
- Configure API URL in [`store-editor/client/config.js`](store-editor/client/config.js) (default `http://localhost:5000`)

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
