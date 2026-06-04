import concurrent.futures

from heuristics import Heuristics
from pathfinder_config import GPU_PROBE, GPU_PROBE_TIMEOUT_SEC
from store_cache import StoreCache

try:
    import cupy as cp  # type: ignore
    CUPY_AVAILABLE = True
    CUGRAPH_AVAILABLE = True
except ImportError:
    CUPY_AVAILABLE = False
    CUGRAPH_AVAILABLE = False


def _cupy_smoke_test():
    device = cp.cuda.Device(0)
    print(f"GPU Device 0 — compute capability {device.compute_capability}", flush=True)
    _ = cp.asarray([1, 2, 3], dtype=cp.int32)


class Pathfinder:
    def __init__(self, db, graph_builder):
        self.db = db
        self.graph_builder = graph_builder
        print("Initializing Pathfinder...", flush=True)
        self.gpu_available = self._check_gpu_availability()

        self.store_cache = StoreCache(graph_builder)
        print("Pathfinder: initializing heuristics...", flush=True)
        self.heuristics = Heuristics(db, self.store_cache, self.gpu_available)
        graph_builder.on_graph_rebuild = self.heuristics.clear_graph_cache
        print("Pathfinder: heuristics initialized", flush=True)

        if self.gpu_available:
            print("GPU available for optional matrix precompute", flush=True)
        else:
            print("Running CPU grid pathfinding", flush=True)

    def _check_gpu_availability(self):
        print("Checking GPU availability...", flush=True)
        if not GPU_PROBE:
            print("GPU probe skipped (PATHFINDER_GPU_PROBE=0) — CPU grid BFS only", flush=True)
            return False
        if not (CUPY_AVAILABLE and CUGRAPH_AVAILABLE):
            print("GPU libraries missing — CPU grid BFS only", flush=True)
            return False
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(_cupy_smoke_test)
                future.result(timeout=GPU_PROBE_TIMEOUT_SEC)
            return True
        except concurrent.futures.TimeoutError:
            print(
                f"GPU probe timed out after {GPU_PROBE_TIMEOUT_SEC}s — using CPU",
                flush=True,
            )
            return False
        except Exception as e:
            print(f"GPU test failed: {e}", flush=True)
            return False

    def find_path(self, store_number, upcs):
        store = self.db.stores.find_one({"store_number": store_number})
        if not store:
            raise ValueError(f"Store {store_number} not found")
        if store.get("starting_points"):
            start = tuple(store["starting_points"][0]["point"])
            end = tuple(store["starting_points"][0]["point"])
        else:
            raise ValueError("No starting_points defined for store")
        return self.find_path_with_endpoints(store_number, upcs, start, end)

    def find_path_with_endpoints(self, store_number, upcs, start, end):
        print(f"Finding path for {len(upcs)} UPCs in store {store_number}", flush=True)
        return self.heuristics.find_pick_path_bfs(store_number, upcs, start, end)

    def cache_stats(self):
        return self.store_cache.cache_stats()
