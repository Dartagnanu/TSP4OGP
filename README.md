# Store pick paths (demo)

Interactive store map that can be used to create pick paths for any number of picks in seconds, instead of a single giant shelf list. You see the floor, detect aisles, and generate a walk that finds the shortest path through each point.

**Watch first:** [Intro presentation](https://youtu.be/1fjKfbaf9TU)

**New Update Cuts Pathfinding Time Nearly HALF by Precompiling the Pathfinding Code Into Assembly.**

[![Intro presentation](https://img.youtube.com/vi/1fjKfbaf9TU/maxresdefault.jpg)](https://youtu.be/1fjKfbaf9TU)

Proof of concept:
[Store Building Demo](./ProjectDemo.mp4)

[Multiple Users Sync Demo](./StoreSyncDemo.mp4)
[20 Sku solve on big lot store](./20SKUSOn150KSquareFootStore.png)
[100 Sku solve on big lot store](./100SKUSOn150KSquareFootStore.png)

This folder is a **runtime demo**. The editor is obfuscated JavaScript; pathfinding is compiled Cython. You can run it and try it on any computer.

## Run the demo

You need **Docker Desktop** (or Docker Engine with Compose). A GPU is not required. The stack sets `PATHFINDER_GPU_PROBE=0`.

The first **gtsp-server** image build is slow: it pulls a CUDA/RAPIDS base image and compiles Cython. Later starts reuse that image.

From this directory:

```bash
docker compose up -d --build mongo app gtsp-server
docker compose --profile seed run --rm seed
```

Then open:

- **Store editor:** http://localhost:3000
- **Pathfinder API:** http://localhost:5000

There is no `docker-compose.override.yml` on purpose. Do not bind-mount host source over the containers.

## Login

Username and password match: `manager` / `manager`, `manager1` / `manager1`, `manager2` / `manager2`.

Store numbers:

- **3260** — small demo (start here)
- **3261** — big-box
- **3262** — dense

A manager can open stores listed on their account. After the first seed, the default managers get all stores.

## Try it yourself

1. Log in with `manager` / `manager` and store **3260**.
2. Detect aisles on the map.
3. Run a **Test Walk** (20/60/80/100 SKU ambient) from the dropdown, or a **Random walk**.
4. Watch the pick path overlay and the pick-path panel.
5. On a pick, click **Empty** if that spot had no product. The picker is treated as standing there. The other stops keep their order, and a new location of that item is inserted, including the walk back to the entrance. Marking another stop empty keeps the earlier empties.
6. Click **Run test cases** to open the case page on that store’s map. The cases are written for store **3262** (see below).
7. Move a shelf, rerun a walk, and see the path change.
8. Optionally try store **3261** the same way. That map is much larger; the first path can take longer.

## How a walk is chosen

A walk is no longer one distance sort. The pathfinder has three modes.

**Default.** Feature locations are preferred. A home replaces a feature only when the full trip is shorter. An equal trip stays on the feature. Topstock is used only when that item has no feature and no home.

**Mixed.** If the request leaves the mode unset and the items span more than one cold chain, it is one tour: all ambient, then all frozen, then all chilled, then a single return to the entrance. An explicit default walk stays distance-only.

**Nil-pick.** The picker is standing at the empty spot. The other stops keep their order. A new location of that item is inserted, including the leg back to the entrance. Topstock still on that shelf is taken first. If the picker names only the shelf, the whole shelf is skipped. Items with no location are listed as `UNKNOWN` after the return and are not drawn on the map.

Small walks of 16 stops or fewer are solved exactly, and that solve includes the return to the end. Shelf choice and stop order are solved together when that cannot make the tour longer. Larger walks run the local improvement passes and the aisle-blocking rules.

## Test cases

**Run test cases** opens a second page on the store you are logged into. Each real walk is 40 SKUs from the entrance back to the entrance. Clicking a case draws that walk and explains the store situation.

The cases run on **3262**. That store’s seed has the items they need: features, homes, topstock, and cold chain. Load it with the seed command in [Extra seeds](#extra-seeds-optional) if the rows cannot find their items.

| Case | What it checks |
|------|----------------|
| Home-only | Forty items that each have one home. Every stop is that home. |
| Flex-only | Items that exist only on a feature. Those stops stay on the feature. |
| Flex stays | An item has a feature and a home, and the feature is the shorter stop. |
| Home wins | The home is the shorter stop, so the walk uses the home. |
| Equal distance | Feature and home are the same shelf approach. The feature stays. |
| Lone flex | One item only, with both a feature and a home. The feature stays. |
| Two homes | An item has two homes and no feature. The walk uses the home that shortens the whole trip. |
| Mixed | Ambient, frozen, and chilled items in that order, then one return. |
| Topstock last resort | An item exists only on topstock, so that is the stop. |
| Topstock hidden | The item also has a feature or a home, so topstock is not used. |
| Nil-pick same-shelf topstock | The home was empty. Topstock on that shelf is inserted. |
| Topstock also nil-picked | That home and its topstock were both empty. The insert is the feature on another shelf. |
| Tie rank | The empty spot was on another shelf. Feature, topstock, and home on the remaining shelf are the same distance, so the insert is the feature. |
| Nil shelf | The picker named the shelf and not the spot. That whole shelf is skipped. |
| Sampler | An item that exists only on topstock still counts as locatable. This one does not build a walk. |

## How pathfinding got faster

The tour rules are the same. The exact 16-stop solve, the local improvement passes, aisle blocking, and 1-foot distances are unchanged.

What changed is repeated work. A search from a cell keeps the distances it already found and continues from there. A walk whose items have only one possible stop skips the extra all-pairs table. Shelf candidates are built once. A nil-pick scores every insert slot from one distance table and loads only the emptied item. Find-path reads skip photos, prices, and other unused fields.

The compiled search runs that same 4-neighbor walk as machine code when Numba is installed. Distances match the Python version, including a search that stops early and is continued later. If Numba is missing, the Python walk is used. The first compile takes under a second. Later searches reuse it.

Docker does not use that compiled search until the pathfinder image is rebuilt. From this directory:

```bash
docker compose build gtsp-server
docker compose up -d mongo app gtsp-server
```

Then load 3262 with the seed command below.

## Extra seeds (optional)

These refresh one store and do not wipe the others:

```bash
docker compose --profile seed-3260 run --rm seed-3260
docker compose --profile seed-3261 run --rm seed-3261
docker compose --profile seed-3262 run --rm seed-3262
```

## If something looks wrong

- Empty map after login: hard-refresh the browser.
- Login fails: restart the app so default managers exist (`docker compose restart app`), and confirm the seed command ran.
