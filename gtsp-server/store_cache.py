"""LRU per-pod cache of store walkability grids and optional distance matrices."""
from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, TYPE_CHECKING

import numpy as np

from graphBuilder import timestamps_equal
from pathfinder_config import MAX_CACHE_MB, MAX_CACHED_STORES, tier_for_walkable_count
from shelf_access import shelf_node_lookup
from walkability import Coord, WalkabilityGrid
if TYPE_CHECKING:
    from graphBuilder import GraphBuilder


@dataclass
class StoreContext:
    store_number: int
    grid: WalkabilityGrid
    shelf_nodes: List[dict]
    shelves_hash: str
    tier: str
    walkable_count: int
    n_shelves: int
    shelf_coords: List[Coord] = field(default_factory=list)
    coord_to_shelf_index: Dict[Coord, int] = field(default_factory=dict)
    shelf_node_by_name: Dict[str, dict] = field(default_factory=dict)
    distance_matrix: Optional[np.ndarray] = None
    matrix_building: bool = False
    store_updated_at: object = None

    def estimate_bytes(self) -> int:
        nbytes = self.grid.estimate_bytes()
        if self.distance_matrix is not None:
            nbytes += self.distance_matrix.nbytes
        return nbytes


class StoreCache:
    def __init__(self, graph_builder: "GraphBuilder"):
        self.graph_builder = graph_builder
        self._entries: OrderedDict[int, StoreContext] = OrderedDict()
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def invalidate(self, store_number: int) -> None:
        self._entries.pop(store_number, None)

    def get_context(self, store_number: int) -> StoreContext:
        current_updated = self.graph_builder.store_updated_at(store_number)

        if store_number in self._entries:
            ctx = self._entries[store_number]
            if timestamps_equal(ctx.store_updated_at, current_updated):
                self._entries.move_to_end(store_number)
                self._stats["hits"] += 1
                return ctx
            print(
                f"StoreCache: store {store_number} updatedAt changed, invalidating",
                flush=True,
            )
            self.invalidate(store_number)

        self._stats["misses"] += 1
        t0 = time.perf_counter()
        grid, shelf_nodes, shelves_hash = self.graph_builder.load_or_build_walkability(
            store_number
        )
        elapsed = time.perf_counter() - t0
        print(
            f"StoreCache: loaded walkability for store {store_number} in {elapsed:.2f}s "
            f"({len(shelf_nodes)} shelf nodes)",
            flush=True,
        )
        shelf_coords: List[Coord] = []
        for n in shelf_nodes:
            if not n.get("accessible", True):
                continue
            if n.get("primary_access"):
                shelf_coords.append(
                    (int(n["primary_access"][0]), int(n["primary_access"][1]))
                )
            else:
                shelf_coords.append((int(n["x"]), int(n["y"])))
        coord_to_idx = {c: i for i, c in enumerate(shelf_coords)}
        walkable_count = grid.walkable_count
        tier = tier_for_walkable_count(walkable_count)
        ctx = StoreContext(
            store_number=store_number,
            grid=grid,
            shelf_nodes=shelf_nodes,
            shelves_hash=shelves_hash,
            store_updated_at=current_updated,
            tier=tier,
            walkable_count=walkable_count,
            n_shelves=len(shelf_nodes),
            shelf_coords=shelf_coords,
            coord_to_shelf_index=coord_to_idx,
            shelf_node_by_name=shelf_node_lookup(shelf_nodes),
        )
        self._entries[store_number] = ctx
        self._evict_if_needed()
        return ctx

    def _evict_if_needed(self) -> None:
        max_bytes = MAX_CACHE_MB * 1024 * 1024

        def total_bytes() -> int:
            return sum(e.estimate_bytes() for e in self._entries.values())

        while len(self._entries) > MAX_CACHED_STORES or total_bytes() > max_bytes:
            if not self._entries:
                break
            evicted_key, _ = self._entries.popitem(last=False)
            self._stats["evictions"] += 1
            print(f"StoreCache: evicted store {evicted_key}", flush=True)

    def cache_stats(self) -> dict:
        return {
            "cached_stores": len(self._entries),
            "stores": [
                {
                    "store_number": sn,
                    "tier": ctx.tier,
                    "walkable_count": ctx.walkable_count,
                    "n_shelves": ctx.n_shelves,
                    "has_matrix": ctx.distance_matrix is not None,
                    "bytes": ctx.estimate_bytes(),
                }
                for sn, ctx in self._entries.items()
            ],
            **self._stats,
        }
