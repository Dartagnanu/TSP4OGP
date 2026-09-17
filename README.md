# Store pick paths (demo)

Interactive store map that can be used to create pick paths for any number of picks in seconds, instead of a single giant shelf list. You see the floor, detect aisles, and generate a walk that finds the shortest path through each point.

**Watch first:** [Intro presentation](./IntroPresentation.mp4)

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
5. Move a shelf, rerun a walk, and see the path change.
6. Optionally try store **3261** or **3262** the same way. Those maps are much larger; the first path can take longer.

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
