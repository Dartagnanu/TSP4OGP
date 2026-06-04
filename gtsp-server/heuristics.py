"""Picking path heuristics: grid BFS, optional shelf matrix, 2-opt."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np

from distance_cache import build_shelf_matrix, matrix_distance, two_opt_improve
from pathfinder_config import GPU_MATRIX_PRECOMPUTE, should_build_matrix as cfg_should_build_matrix
from pathfinder_config import should_run_two_opt
from store_cache import StoreCache, StoreContext
from walkability import Coord, WalkabilityGrid
try:
    import cugraph  # type: ignore
    GPU_LIBS = True
except ImportError:
    GPU_LIBS = False

INF = float("inf")


def _dedupe_locations_by_placement(locations: List[dict]) -> List[dict]:
    """One candidate per shelf access cell; stable tie-break by shelf_name."""
    by_cell: Dict[tuple, dict] = {}
    for loc in locations:
        key = tuple(loc.get("location") or ())
        name = str(loc.get("shelf_name") or "")
        prev = by_cell.get(key)
        if prev is None or name < str(prev.get("shelf_name") or ""):
            by_cell[key] = loc
    return list(by_cell.values())


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
        self.gpu_available = bool(gpu_available) and GPU_LIBS
        self._sssp_count = 0

        if not self.gpu_available:
            print(
                "Pathfinding uses CPU grid BFS (GPU reserved for optional matrix batch)",
                flush=True,
            )

    def clear_graph_cache(self, store_number: int) -> None:
        self.store_cache.invalidate(store_number)

    def _ensure_matrix(self, ctx: StoreContext) -> None:
        if ctx.distance_matrix is not None or ctx.matrix_building:
            return
        if not cfg_should_build_matrix(ctx.tier, ctx.n_shelves):
            return

        ctx.matrix_building = True
        try:
            print(
                f"Building shelf distance matrix for store {ctx.store_number} "
                f"({ctx.n_shelves} shelves, tier {ctx.tier})",
                flush=True,
            )
            use_gpu = self.gpu_available and GPU_MATRIX_PRECOMPUTE
            ctx.distance_matrix = build_shelf_matrix(
                ctx.grid, ctx.shelf_coords, gpu_available=use_gpu
            )
        finally:
            ctx.matrix_building = False

    def _distance(
        self,
        ctx: StoreContext,
        dist_field: Optional[np.ndarray],
        start: Coord,
        end: Coord,
    ) -> float:
        if ctx.distance_matrix is not None:
            return matrix_distance(
                ctx.distance_matrix,
                ctx.coord_to_shelf_index,
                start,
                end,
            )
        if dist_field is not None:
            ex, ey = int(end[0]), int(end[1])
            if 0 <= ey < ctx.grid.height and 0 <= ex < ctx.grid.width:
                d = int(dist_field[ey, ex])
                return float(d) if d >= 0 else INF
            return INF
        return ctx.grid.distance_between(start, end)

    def _distance_field(self, ctx: StoreContext, start: Coord) -> np.ndarray:
        self._sssp_count += 1
        return ctx.grid.bfs_distance_field(start)

    def find_pick_path_bfs(
        self,
        store_number: int,
        upcs: List[str],
        start_point: Coord,
        end_point: Optional[Coord] = None,
    ) -> List[dict]:
        self._sssp_count = 0
        ctx = self.store_cache.get_context(store_number)
        self._ensure_matrix(ctx)

        upc_to_data = self._fetch_upc_locations(store_number, upcs)
        pick_list, last_dist_field, current_location = self._greedy_pick_sequence(
            ctx, start_point, upc_to_data, upcs
        )

        if should_run_two_opt(ctx.tier, len(upcs)) and ctx.distance_matrix is not None:
            pick_list = self._apply_two_opt(ctx, pick_list, start_point)

        if end_point is not None:
            for entry in pick_list:
                if entry.get("location") is not None:
                    current_location = entry["location"]
            if end_point != current_location:
                if last_dist_field is not None and int(end_point[0]) < ctx.grid.width:
                    return_distance = self._distance(
                        ctx, last_dist_field, current_location, end_point
                    )
                else:
                    return_distance = self._distance(
                        ctx, None, current_location, end_point
                    )
                    self._sssp_count += 1
                pick_list.append(
                    {
                        "type": "return",
                        "location": end_point,
                        "distance_from_previous": return_distance,
                    }
                )

        print(
            f"find-path store {store_number}: tier={ctx.tier} "
            f"bfs_count={self._sssp_count} matrix={ctx.distance_matrix is not None}",
            flush=True,
        )
        return pick_list

    def _fetch_upc_locations(self, store_number: int, upcs: List[str]) -> dict:
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
                locations.append(
                    {
                        "shelf": shelf_data,
                        "shelf_name": shelf_data.get(
                            "shelf_name", str(shelf_data["_id"])
                        ),
                        "location": (
                            shelf_data["placement_x"],
                            shelf_data["placement_y"],
                        ),
                        "modular_location": loc.get("location"),
                    }
                )
            deduped = _dedupe_locations_by_placement(locations)
            for upc in matched_upcs:
                upc_to_data[upc] = {"item_name": item_name, "locations": deduped}

        per_upc = {}
        for upc in upcs:
            locs = upc_to_data.get(upc, {}).get("locations", [])
            per_upc[upc] = [
                {
                    "shelf_name": loc.get("shelf_name"),
                    "placement": list(loc.get("location") or []),
                }
                for loc in locs
            ]
        return upc_to_data

    def _greedy_pick_sequence(
        self,
        ctx: StoreContext,
        start_point: Coord,
        upc_to_data: dict,
        upcs: List[str],
    ) -> Tuple[List[dict], Optional[np.ndarray], Coord]:
        pick_list: List[dict] = []
        visited_upcs = set()
        current_location = start_point
        unreachable_items: List[str] = []
        last_dist_field: Optional[np.ndarray] = None

        for _ in range(len(upcs)):
            closest_upc = None
            closest_distance = INF
            closest_shelf = None
            closest_location = None
            current_in_matrix = (
                ctx.distance_matrix is not None
                and current_location in ctx.coord_to_shelf_index
            )
            dist_field = None
            if not current_in_matrix:
                dist_field = self._distance_field(ctx, current_location)
                last_dist_field = dist_field

            for upc in upcs:
                if upc in visited_upcs:
                    continue
                locations = upc_to_data[upc]["locations"]
                if not locations:
                    if upc not in unreachable_items:
                        unreachable_items.append(upc)
                    continue

                for loc_data in locations:
                    shelf_location = loc_data["location"]
                    if current_in_matrix:
                        distance = matrix_distance(
                            ctx.distance_matrix,
                            ctx.coord_to_shelf_index,
                            current_location,
                            shelf_location,
                        )
                        if current_location == shelf_location:
                            distance = 0.0
                    else:
                        ex, ey = int(shelf_location[0]), int(shelf_location[1])
                        d = int(dist_field[ey, ex])  # type: ignore
                        distance = float(d) if d >= 0 else INF

                    shelf_name = str(loc_data.get("shelf_name") or "")
                    closest_name = str(
                        (closest_shelf or {}).get("shelf_name") or ""
                    )
                    if distance < closest_distance or (
                        distance == closest_distance
                        and closest_shelf is not None
                        and shelf_name < closest_name
                    ):
                        closest_distance = distance
                        closest_upc = upc
                        closest_shelf = loc_data
                        closest_location = shelf_location

            if closest_upc:
                candidates = []
                for upc in upcs:
                    if upc in visited_upcs:
                        continue
                    for loc_data in upc_to_data[upc].get("locations", []):
                        shelf_location = loc_data["location"]
                        if current_in_matrix:
                            distance = matrix_distance(
                                ctx.distance_matrix,
                                ctx.coord_to_shelf_index,
                                current_location,
                                shelf_location,
                            )
                            if current_location == shelf_location:
                                distance = 0.0
                        else:
                            ex, ey = int(shelf_location[0]), int(shelf_location[1])
                            d = int(dist_field[ey, ex])  # type: ignore
                            distance = float(d) if d >= 0 else INF
                        candidates.append({
                            "upc": upc,
                            "shelf_name": loc_data.get("shelf_name"),
                            "location": list(shelf_location),
                            "distance": float(distance),
                        })
                shelf_data = closest_shelf.get("shelf", {})
                pick_list.append(
                    {
                        "upc": closest_upc,
                        "item_name": upc_to_data[closest_upc]["item_name"],
                        "shelf": closest_shelf["shelf_name"],
                        "shelf_data": {
                            "shelf_name": closest_shelf.get("shelf_name"),
                            "placement_x": shelf_data.get("placement_x"),
                            "placement_y": shelf_data.get("placement_y"),
                            "template": shelf_data.get("template"),
                            "department": shelf_data.get("department"),
                            "modulars": shelf_data.get("modulars"),
                        },
                        "modular_location": closest_shelf.get("modular_location"),
                        "location": closest_location,
                        "distance_from_previous": closest_distance,
                    }
                )
                visited_upcs.add(closest_upc)
                current_location = closest_location
            else:
                for upc in upcs:
                    if upc not in visited_upcs and upc not in unreachable_items:
                        unreachable_items.append(upc)
                break

        for upc in unreachable_items:
            if upc in visited_upcs:
                continue
            pick_list.append(
                {
                    "upc": upc,
                    "item_name": upc_to_data[upc]["item_name"],
                    "shelf": "unknown",
                    "shelf_data": None,
                    "modular_location": None,
                    "location": None,
                    "unreachable": True,
                }
            )
            visited_upcs.add(upc)

        return pick_list, last_dist_field, current_location

    def _apply_two_opt(
        self, ctx: StoreContext, pick_list: List[dict], start_point: Coord
    ) -> List[dict]:
        picks = [p for p in pick_list if p.get("location") and not p.get("unreachable")]
        if len(picks) < 4:
            return pick_list

        coords = [tuple(p["location"]) for p in picks]
        indices = []
        for c in coords:
            idx = ctx.coord_to_shelf_index.get(c)
            if idx is None:
                return pick_list
            indices.append(idx)

        start_idx = ctx.coord_to_shelf_index.get(start_point)
        if start_idx is not None and start_idx in indices:
            indices.remove(start_idx)
            indices.insert(0, start_idx)
        elif start_idx is None:
            pass

        improved = two_opt_improve(indices, ctx.distance_matrix)
        coord_order = [ctx.shelf_coords[i] for i in improved]
        pick_by_coord = {tuple(p["location"]): p for p in picks}
        reordered = [pick_by_coord[c] for c in coord_order if c in pick_by_coord]
        unreachable = [p for p in pick_list if p.get("unreachable")]
        return reordered + unreachable
