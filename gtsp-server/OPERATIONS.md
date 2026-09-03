# gtsp-server operations (multi-store / multi-pod)

## Stateless API

- Any pod can serve any `store_number`; no sticky sessions.
- **Mongo `store_graphs`** is the source of truth (`format: walkability_v2`).
- In-process **LRU cache** is per-pod only. Invalidate by copying `stores.updatedAt` onto `store_graphs.store_updated_at` and comparing **equality** (not wall-clock `last_updated`). Shelf create/update/delete/clone (and seed) must `$set` `stores.updatedAt`. Direct Compass/Mongo shelf edits do not invalidate until something touches the store document.

## Mongo

- Index: `store_graphs.store_number` (unique in app schema).
- Compact documents: `width`, `height`, packed `walkable` bits, `shelf_nodes`, `shelves_hash`, `store_updated_at`.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PATHFINDER_MAX_CACHED_STORES` | 50 | LRU store count cap per pod |
| `PATHFINDER_MAX_CACHE_MB` | 512 | LRU memory budget per pod |
| `PATHFINDER_TIER_S_CELLS` | 10000 | Tier S max walkable cells |
| `PATHFINDER_TIER_M_CELLS` | 100000 | Tier M max walkable cells |
| `PATHFINDER_MATRIX_MAX_SHELVES` | 500 | Skip n×n matrix above this |
| `PATHFINDER_MATRIX_MAX_ENTRIES` | 250000 | Skip matrix if n² exceeds |
| `PATHFINDER_TIER_M_MATRIX_SHELVES` | 300 | Matrix allowed in tier M |
| `PATHFINDER_TWO_OPT_MAX_K` | 150 | Skip 2-opt above this pick count |
| `PATHFINDER_GTSP_EXACT_MAX_K` | 12 | Exact GTSP DP up to this pick count |
| `PATHFINDER_COLLATION_WEIGHT` | 2 | Same-shelf routing priority bonus (grid cells) |
| `PATHFINDER_RELOCATE_MAX_OUTLIERS` | 3 | Multi-location outlier re-checks per pass |
| `PATHFINDER_OROPT` | 1 | Or-opt longest-leg relocate after 2-opt (`0`/`false`/`no` to disable) |
| `PATHFINDER_OROPT_MAX_LEGS` | 8 | Max unique-shelf long hops considered per Or-opt pass |
| `PATHFINDER_OROPT_NEIGHBORS` | 5 | k-nearest other stops to try as relocate targets |
| `PATHFINDER_OROPT_MAX_PASSES` | 3 | Max Or-opt passes (stops early if no improvement) |
| `PATHFINDER_MAX_MAP_WIDTH` | 2000 | Reject wider maps |
| `PATHFINDER_MAX_MAP_HEIGHT` | 2500 | Reject taller maps |
| `PATHFINDER_GPU_MATRIX_PRECOMPUTE` | 1 | GPU for matrix build (still CPU BFS today) |
| `PATHFINDER_GPU_PROBE` | 1 | CuPy smoke test on init; set `0` in Docker if GPU probe hangs |
| `PATHFINDER_GPU_PROBE_TIMEOUT_SEC` | 5 | Max seconds for GPU probe before falling back to CPU |

## Endpoints

- `GET /ping` — health
- `GET /cache-stats` — per-pod cache (stores, tiers, bytes)
- `POST /find-path` — pick path
- `GET /graph/<store_number>` — summary or node_link if ≤50k walkable nodes

## Horizontal scale

- Add pods behind a load balancer; lower `PATHFINDER_MAX_CACHED_STORES` if memory is tight.
- First request to a store on a cold pod rebuilds or loads from Mongo (XL maps may take seconds).

## Future

- Shared Redis cache across pods for hot stores (not implemented).
