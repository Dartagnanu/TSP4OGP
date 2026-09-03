"""Picking path heuristics: GTSP solver over walkability grid."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from gtsp_solver import solve_tour
from store_cache import StoreCache, StoreContext
from walkability import Coord

INF = float("inf")


def _resolve_shelf_doc(shelf_by_id: dict, ref) -> Optional[dict]:
    if ref is None:
        return None
    if ref in shelf_by_id:
        return shelf_by_id[ref]
    ref_str = str(ref)
    for key, doc in shelf_by_id.items():
        if str(key) == ref_str:
            return doc
    return None


class Heuristics:
    def __init__(self, db, store_cache: StoreCache, gpu_available: bool = False):
        self.db = db
        self.store_cache = store_cache
        self.gpu_available = bool(gpu_available)
        self._sssp_count = 0
        print(
            "Pathfinding uses CPU grid BFS + GTSP heuristics",
            flush=True,
        )

    def clear_graph_cache(self, store_number: int) -> None:
        self.store_cache.invalidate(store_number)

    def find_pick_path_bfs(
        self,
        store_number: int,
        upcs: List[str],
        start_point: Coord,
        end_point: Optional[Coord] = None,
    ) -> List[dict]:
        self._sssp_count = 0
        ctx = self.store_cache.get_context(store_number)
        orig_start = (int(start_point[0]), int(start_point[1]))
        orig_end = (
            (int(end_point[0]), int(end_point[1])) if end_point is not None else None
        )
        start = ctx.grid.snap_to_walkable(orig_start)
        end = ctx.grid.snap_to_walkable(orig_end) if orig_end is not None else start
        if start != orig_start:
            print(
                f"find-path store {store_number}: snapped start {orig_start} -> {start}",
                flush=True,
            )
        if orig_end is not None and end != orig_end:
            print(
                f"find-path store {store_number}: snapped end {orig_end} -> {end}",
                flush=True,
            )
        upc_to_data = self._fetch_upc_locations(store_number, upcs, ctx)

        pick_list, _unreachable = solve_tour(
            ctx, upc_to_data, upcs, start, end
        )

        current_location = start
        for entry in pick_list:
            if entry.get("location") is not None:
                current_location = tuple(entry["location"])
        if current_location != end:
            return_distance = ctx.grid.distance_between(current_location, end)
            self._sssp_count += 1
            pick_list.append(
                {
                    "type": "return",
                    "location": list(end),
                    "distance_from_previous": return_distance,
                }
            )

        print(
            f"find-path store {store_number}: tier={ctx.tier} "
            f"bfs_count={self._sssp_count} picks={len(upcs)}",
            flush=True,
        )
        return pick_list

    def _fetch_upc_locations(
        self, store_number: int, upcs: List[str], ctx: StoreContext
    ) -> dict:
        upc_to_data = {upc: {"item_name": "Unknown", "locations": []} for upc in upcs}
        if not upcs:
            return upc_to_data

        indexes = list(
            self.db.itemindexes.find(
                {"store_number": store_number, "upcs": {"$in": list(upcs)}}
            )
        )
        shelf_ids = set()
        for doc in indexes:
            for loc in doc.get("locations", []):
                shelf_ids.add(loc["shelf_name"])

        shelf_by_id = {}
        if shelf_ids:
            for shelf in self.db.shelves.find({"_id": {"$in": list(shelf_ids)}}):
                shelf_by_id[shelf["_id"]] = shelf

        for doc in indexes:
            matched_upcs = [u for u in doc.get("upcs", []) if u in upc_to_data]
            if not matched_upcs:
                continue
            item_name = doc.get("name", "Unknown")
            locations = []
            for loc in doc.get("locations", []):
                shelf_data = _resolve_shelf_doc(shelf_by_id, loc.get("shelf_name"))
                if not shelf_data:
                    continue
                shelf_name = shelf_data.get(
                    "shelf_name", str(shelf_data["_id"])
                )
                node = ctx.shelf_node_by_name.get(shelf_name) or ctx.shelf_node_by_name.get(
                    str(shelf_data.get("_id", ""))
                )
                if node and not node.get("accessible", True):
                    continue
                if node and node.get("primary_access"):
                    access = tuple(node["primary_access"])
                else:
                    access = (
                        int(shelf_data["placement_x"]),
                        int(shelf_data["placement_y"]),
                    )
                locations.append(
                    {
                        "shelf": shelf_data,
                        "shelf_name": shelf_name,
                        "location": access,
                        "modular_location": loc.get("location"),
                    }
                )
            for upc in matched_upcs:
                upc_to_data[upc] = {"item_name": item_name, "locations": locations}

        return upc_to_data
