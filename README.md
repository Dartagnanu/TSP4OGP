# Store pick paths (demo)

Interactive store map that plans **aisle-based pick paths** instead of a single giant shelf sequence (the kind of walk that can stretch to ~150k ft). You see the floor, detect aisles, and generate a walk that actually goes down those aisles.

**Watch first:** [Intro presentation](./IntroPresentation.mp4)

This folder is a **runtime demo**, not the private original. The UI JavaScript is bundled and obfuscated; pathfinding is compiled (Cython). You can run it and try the product. You cannot read the real source here.

## Rebuild from Original

Keep `TSP4OGPOriginal` as a sibling of this folder (or set `TSP4OGP_ORIGINAL`). From **this** directory:

```bash
npm install
npm run build
```

That reads Original, writes obfuscated JS and Cython `.c` here, and does not change Original. Do not publish `.tmp/`.

## Run

From **this** directory:

```bash
docker compose up -d --build mongo app gtsp-server
docker compose --profile seed run --rm seed
```

Then open:

- Store editor: http://localhost:3000
- Pathfinder API: http://localhost:5000

**Login:** `manager` / `manager` (password matches username). Use store **3260**. Stores **3261** and **3262** work the same way (`manager1` / `manager1`, `manager2` / `manager2`).

Optional extra seeds (do not wipe other stores):

```bash
docker compose --profile seed-3260 run --rm seed-3260
docker compose --profile seed-3261 run --rm seed-3261
docker compose --profile seed-3262 run --rm seed-3262
```

### First build is slow

`gtsp-server` starts from a CUDA/RAPIDS base image and **compiles Cython extensions** during `docker compose build`. The first build is large and can take a long time. Later starts reuse the image.

GPU is optional. This compose file does **not** require an NVIDIA device. Pathfinding stays on CPU (`PATHFINDER_GPU_PROBE=0`).

There is **no** `docker-compose.override.yml` here on purpose. Do not bind-mount host source over the containers — that would replace the obfuscated artifacts.

## What to try

After login:

1. **Detect aisles** on the store map.
2. Run a **test** or **random pickwalk** and watch the path.
3. **Move a shelf**, then rerun a walk and see the path change.

## What this copy is (and isn’t)

| Obfuscated / compiled | Left readable (glue) |
| --- | --- |
| Browser UI: one bundled, obfuscated `app.js` | `index.html`, `style.css` |
| Node server and seed CLIs | `package.json`, seed JSON / maps if present |
| Pathfinding modules (Cython → `.so` in Docker) | Flask `app.py`, `walkability.py`, `pathfinder_config.py` |

Readable leftovers exist so the demo can boot. They are not the private original. **Readable product source is not in this folder.**

## Copying this folder to a public repo

Copy the folder contents **except**:

- `.tmp/`
- `node_modules/`
- `.venv/`

A local rebuild writes **plaintext source into `.tmp/`**. Never publish `.tmp`.
