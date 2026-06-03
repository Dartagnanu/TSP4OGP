# gtsp-server operations (multi-store / multi-pod)

## Stateless API

- Any pod can serve any `store_number`; no sticky sessions.
- **Mongo `store_graphs`** is the source of truth (`format: walkability_v1`).
- In-process **LRU cache** is per-pod only.

## Mongo

- Index: `store_graphs.store_number` (unique in app schema).
- Compact documents: `width`, `height`, packed `walkable` bits, `shelf_nodes`, `shelves_hash`.

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
| `PATHFINDER_TWO_OPT_MAX_K` | 80 | Skip 2-opt above this pick count |
| `PATHFINDER_MAX_MAP_WIDTH` | 2000 | Reject wider maps |
| `PATHFINDER_MAX_MAP_HEIGHT` | 2500 | Reject taller maps |
| `PATHFINDER_GPU_MATRIX_PRECOMPUTE` | 1 | GPU for matrix build (still CPU BFS today) |

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
