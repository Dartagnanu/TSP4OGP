import networkx as nx
from networkx.readwrite import json_graph
from heuristics import Heuristics

try:
    import cudf  # type: ignore
    import cugraph  # type: ignore
    import cupy as cp  # type: ignore
    CUPY_AVAILABLE = True
    CUGRAPH_AVAILABLE = True
except ImportError:
    import numpy as cp  # Use numpy as fallback
    CUPY_AVAILABLE = False
    CUGRAPH_AVAILABLE = False

class Pathfinder:
    def __init__(self, db, graph_builder):
        self.db = db
        self.graph_builder = graph_builder
        print("Initializing Pathfinder...")
        self.gpu_available = self._check_gpu_availability()
        
        # Initialize heuristics module for picking strategy
        print("Pathfinder: initializing heuristics...", flush=True)
        self.heuristics = Heuristics(db, graph_builder, self.gpu_available)
        print("Pathfinder: heuristics initialized", flush=True)
        
        if self.gpu_available:
            print("GPU acceleration ENABLED - cuGraph and CuPy ready!", flush=True)
        else:
            print("Running in CPU mode - GPU acceleration not available", flush=True)
    
    def _check_gpu_availability(self):
        """Check if GPU and cuGraph are available"""
        print("Checking GPU availability...")
        if not (CUPY_AVAILABLE and CUGRAPH_AVAILABLE):
            print(f"GPU libraries missing - CuPy: {CUPY_AVAILABLE}, cuGraph: {CUGRAPH_AVAILABLE}")
            print("Falling back to CPU-based pathfinding (slower but functional)")
            return False
        
        try:
            # Test GPU availability when imports succeed
            device = cp.cuda.Device(0)
            compute_cap = device.compute_capability
            print(f"GPU Device 0 found - Compute capability: {compute_cap}")

            # Basic operation to ensure CUDA context is ready
            # No host copy is required here to avoid potential device/transfer issues
            _ = cp.asarray([1, 2, 3], dtype=cp.int32)

            print("GPU checks passed - cuPy and device initialized")
            return True
        except Exception as e:
            print(f"GPU test failed: {e}")
            print("Falling back to CPU-based pathfinding")
            return False

    def find_path(self, store_number, upcs):
        store = self.db.stores.find_one({'store_number': store_number})
        print(store)
        # Use the first starting point, or handle empty list
        if store.get('starting_points'):
            start = tuple(store['starting_points'][0]['point'])
            end = tuple(store['starting_points'][0]['point'])  # assuming round trip
        else:
            raise ValueError("No starting_points defined for store")
        return self.find_path_with_endpoints(store_number, upcs, start, end)
    
    def find_path_with_endpoints(self, store_number, upcs, start, end):
        """Use the modular Heuristics class to find the picking path"""
        print(f"Finding path for {len(upcs)} UPCs in store {store_number}")
        
        if not self.gpu_available:
            print("Running in CPU fallback pathfinding mode (GPU acceleration not available)", flush=True)

        # Use the heuristics module to find the pick path via BFS
        pick_list = self.heuristics.find_pick_path_bfs(store_number, upcs, start)
        return pick_list



