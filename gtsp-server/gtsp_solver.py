"""GTSP tour solver: exact DP (small k), insertion + 2-opt, Or-opt, collation, outlier pass."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import numpy as np

from distance_cache import build_coord_matrix, matrix_distance, tour_length, two_opt_improve
from pathfinder_config import (
    COLLATION_MERGE_PASS,
    COLLATION_WEIGHT,
    GTSP_EXACT_MAX_K,
    OROPT_ENABLED,
    OROPT_MAX_LEGS,
    OROPT_MAX_PASSES,
    OROPT_NEIGHBORS,
    RELOCATE_MAX_PASSES,
    relocate_outlier_cap,
    should_build_matrix,
    should_run_or_opt,
    should_run_two_opt,
    two_opt_iterations,
)
from walkability import Coord

INF = float("inf")

ShelfKey = Tuple[str, Coord]


@dataclass
class Candidate:
    upc: str
    shelf_name: str
    access_point: Coord
    loc_data: dict
    item_name: str


@dataclass
class TourStop:
    upc: str
    shelf_name: str
    access_point: Coord
    loc_data: dict
    item_name: str


def _modular_sort_key(loc_data: dict) -> Tuple[int, float, str]:
    ml = loc_data.get("modular_location")
    if ml is None:
        return (1, 0.0, "")
    if isinstance(ml, (int, float)):
        return (0, float(ml), "")
    return (0, 0.0, str(ml))


def _shelf_key(shelf_name: str, access: Coord) -> ShelfKey:
    return (str(shelf_name), (int(access[0]), int(access[1])))


def build_candidates(
    upcs: List[str],
    upc_to_data: dict,
    shelf_lookup: Dict[str, dict],
) -> Tuple[Dict[str, List[Candidate]], List[str]]:
    """Resolve UPCs to accessible candidates; return unreachable UPCs."""
    groups: Dict[str, List[Candidate]] = {}
    unreachable: List[str] = []

    for upc in upcs:
        data = upc_to_data.get(upc, {})
        item_name = data.get("item_name", "Unknown")
        locs = data.get("locations") or []
        cands: List[Candidate] = []
        seen: Set[ShelfKey] = set()

        for loc in locs:
            shelf_name = str(loc.get("shelf_name") or "")
            node = shelf_lookup.get(shelf_name)
            if node and not node.get("accessible", True):
                continue
            if node and node.get("primary_access"):
                access = tuple(node["primary_access"])
            else:
                access = tuple(loc.get("location") or ())
            if len(access) != 2:
                continue
            access = (int(access[0]), int(access[1]))
            key = _shelf_key(shelf_name, access)
            if key in seen:
                continue
            seen.add(key)
            cands.append(
                Candidate(
                    upc=upc,
                    shelf_name=shelf_name,
                    access_point=access,
                    loc_data=loc,
                    item_name=item_name,
                )
            )

        if cands:
            groups[upc] = cands
        else:
            unreachable.append(upc)

    return groups, unreachable


def build_shelf_cluster_map(
    groups: Dict[str, List[Candidate]],
) -> Dict[ShelfKey, List[str]]:
    """UPCs that share an exact shelf+access candidate."""
    cluster: Dict[ShelfKey, List[str]] = {}
    for upc, cands in groups.items():
        for c in cands:
            key = _shelf_key(c.shelf_name, c.access_point)
            cluster.setdefault(key, [])
            if upc not in cluster[key]:
                cluster[key].append(upc)
    return {k: v for k, v in cluster.items() if len(v) > 1}


def _collation_bonus(
    shelf_key: ShelfKey,
    cluster_map: Dict[ShelfKey, List[str]],
    visited: Set[str],
) -> float:
    upcs = cluster_map.get(shelf_key, [])
    count = sum(1 for u in upcs if u not in visited)
    if count <= 1:
        return 0.0
    return COLLATION_WEIGHT * (count - 1)


def _batch_upcs_at(
    shelf_key: ShelfKey,
    groups: Dict[str, List[Candidate]],
    visited: Set[str],
) -> List[str]:
    """Unvisited UPCs that can pick at this shelf+access."""
    batch = []
    for upc, cands in groups.items():
        if upc in visited:
            continue
        for c in cands:
            if _shelf_key(c.shelf_name, c.access_point) == shelf_key:
                batch.append(upc)
                break
    return batch


def _pick_candidate(
    groups: Dict[str, List[Candidate]],
    upc: str,
    shelf_key: ShelfKey,
) -> Optional[Candidate]:
    for c in groups.get(upc, []):
        if _shelf_key(c.shelf_name, c.access_point) == shelf_key:
            return c
    return None


def _build_matrix_context(
    groups: Dict[str, List[Candidate]],
    start: Coord,
    end: Optional[Coord],
    grid,
    tier: str,
    k: int,
) -> Tuple[Optional[np.ndarray], Dict[Coord, int], List[Coord]]:
    from pathfinder_config import MATRIX_MAX_ENTRIES, MATRIX_MAX_SHELVES

    coords: List[Coord] = [start]
    seen = {start}
    if end and end != start and end not in seen:
        coords.append(end)
        seen.add(end)
    for cands in groups.values():
        for c in cands:
            if c.access_point not in seen:
                coords.append(c.access_point)
                seen.add(c.access_point)

    n = len(coords)
    if n > MATRIX_MAX_SHELVES or n * n > MATRIX_MAX_ENTRIES:
        return None, {}, coords

    matrix = build_coord_matrix(grid, coords)
    idx = {c: i for i, c in enumerate(coords)}
    return matrix, idx, coords


def _dist(
    matrix: Optional[np.ndarray],
    idx: Dict[Coord, int],
    a: Coord,
    b: Coord,
    grid,
) -> float:
    if matrix is not None:
        return matrix_distance(matrix, idx, a, b)
    return grid.distance_between(a, b)


def _stops_to_entries(
    stops: List[TourStop],
    matrix: Optional[np.ndarray],
    idx: Dict[Coord, int],
    grid,
    start: Coord,
) -> List[dict]:
    entries: List[dict] = []
    prev = start
    for stop in stops:
        d = _dist(matrix, idx, prev, stop.access_point, grid)
        shelf_data = stop.loc_data.get("shelf") or {}
        entries.append(
            {
                "upc": stop.upc,
                "item_name": stop.item_name,
                "shelf": stop.shelf_name,
                "shelf_data": {
                    "shelf_name": stop.shelf_name,
                    "placement_x": shelf_data.get("placement_x"),
                    "placement_y": shelf_data.get("placement_y"),
                    "template": shelf_data.get("template"),
                    "department": shelf_data.get("department"),
                    "modulars": shelf_data.get("modulars"),
                },
                "modular_location": stop.loc_data.get("modular_location"),
                "location": list(stop.access_point),
                "distance_from_previous": d,
            }
        )
        prev = stop.access_point
    return _apply_same_shelf_zero_dist(entries)


def _apply_same_shelf_zero_dist(entries: List[dict]) -> List[dict]:
    out = []
    prev_loc = None
    for e in entries:
        loc = tuple(e.get("location") or ())
        if prev_loc is not None and loc == prev_loc:
            e = dict(e)
            e["distance_from_previous"] = 0.0
            e["same_shelf_batch"] = True
        out.append(e)
        prev_loc = loc
    return out


def _expand_batch_stops(
    batch_upcs: List[str],
    shelf_key: ShelfKey,
    groups: Dict[str, List[Candidate]],
) -> List[TourStop]:
    locs = []
    for upc in batch_upcs:
        c = _pick_candidate(groups, upc, shelf_key)
        if c:
            locs.append((upc, c))
    locs.sort(key=lambda x: _modular_sort_key(x[1].loc_data))
    return [
        TourStop(
            upc=c.upc,
            shelf_name=c.shelf_name,
            access_point=c.access_point,
            loc_data=c.loc_data,
            item_name=c.item_name,
        )
        for _, c in locs
    ]


def _solve_trivial(
    groups: Dict[str, List[Candidate]],
    upcs: List[str],
    start: Coord,
    matrix,
    idx,
    grid,
) -> List[TourStop]:
    upc = upcs[0]
    cands = groups.get(upc, [])
    if not cands:
        return []
    best = min(cands, key=lambda c: _dist(matrix, idx, start, c.access_point, grid))
    return [
        TourStop(
            upc=best.upc,
            shelf_name=best.shelf_name,
            access_point=best.access_point,
            loc_data=best.loc_data,
            item_name=best.item_name,
        )
    ]


def _solve_exact_dp(
    groups: Dict[str, List[Candidate]],
    upcs: List[str],
    start: Coord,
    matrix,
    idx: Dict[Coord, int],
    grid,
    cluster_map: Dict[ShelfKey, List[str]],
) -> List[TourStop]:
    n = len(upcs)
    upc_index = {u: i for i, u in enumerate(upcs)}
    full_mask = (1 << n) - 1

    dp: Dict[int, Tuple[float, Coord]] = {0: (0.0, start)}
    parent: Dict[int, Tuple[int, ShelfKey, List[str]]] = {}

    for mask in range(full_mask + 1):
        if mask not in dp:
            continue
        cost_so_far, last = dp[mask]
        visited = _mask_to_upcs(mask, upcs)

        for upc in upcs:
            if upc in visited:
                continue
            for cand in groups[upc]:
                sk = _shelf_key(cand.shelf_name, cand.access_point)
                batch = _batch_upcs_at(sk, groups, visited)
                new_mask = mask
                for bu in batch:
                    new_mask |= 1 << upc_index[bu]
                if new_mask == mask:
                    continue
                step = _dist(matrix, idx, last, cand.access_point, grid)
                if step >= INF:
                    continue
                new_cost = cost_so_far + step
                if new_mask not in dp or new_cost < dp[new_mask][0]:
                    dp[new_mask] = (new_cost, cand.access_point)
                    parent[new_mask] = (mask, sk, batch)

    if full_mask not in dp:
        return []

    stops: List[TourStop] = []
    mask = full_mask
    while mask in parent:
        pm, sk, batch = parent[mask]
        stops = _expand_batch_stops(batch, sk, groups) + stops
        mask = pm
    return stops


def _mask_to_upcs(mask: int, upcs: List[str]) -> Set[str]:
    return {upcs[i] for i in range(len(upcs)) if mask & (1 << i)}


def _insertion_cost(
    tour: List[TourStop],
    pos: int,
    access: Coord,
    start: Coord,
    matrix,
    idx: Dict[Coord, int],
    grid,
    bonus: float,
) -> float:
    prev = start if pos == 0 else tour[pos - 1].access_point
    if pos >= len(tour):
        leg = _dist(matrix, idx, prev, access, grid)
    else:
        nxt = tour[pos].access_point
        leg = (
            _dist(matrix, idx, prev, access, grid)
            + _dist(matrix, idx, access, nxt, grid)
            - _dist(matrix, idx, prev, nxt, grid)
        )
    return leg - bonus


def _solve_insertion(
    groups: Dict[str, List[Candidate]],
    upcs: List[str],
    start: Coord,
    matrix,
    idx: Dict[Coord, int],
    grid,
    cluster_map: Dict[ShelfKey, List[str]],
    tier: str,
    k: int,
) -> List[TourStop]:
    """GTSP best insertion with collation bias."""
    visited: Set[str] = set()
    tour: List[TourStop] = []

    while len(visited) < len(upcs):
        best_cost = INF
        best_insert: Optional[Tuple[int, List[str], List[TourStop]]] = None

        for upc in upcs:
            if upc in visited:
                continue
            for cand in groups[upc]:
                sk = _shelf_key(cand.shelf_name, cand.access_point)
                batch = _batch_upcs_at(sk, groups, visited)
                if upc not in batch:
                    continue
                batch_stops = _expand_batch_stops(batch, sk, groups)
                bonus = _collation_bonus(sk, cluster_map, visited)

                for pos in range(len(tour) + 1):
                    cost = _insertion_cost(
                        tour, pos, cand.access_point, start, matrix, idx, grid, bonus
                    )
                    if cost < best_cost:
                        best_cost = cost
                        best_insert = (pos, batch, batch_stops)

        if best_insert is None:
            break
        pos, batch, batch_stops = best_insert
        tour = tour[:pos] + batch_stops + tour[pos:]
        for u in batch:
            visited.add(u)

    return tour


def _segments_from_stops(stops: List[TourStop]) -> List[List[TourStop]]:
    if not stops:
        return []
    segments: List[List[TourStop]] = [[stops[0]]]
    for s in stops[1:]:
        if s.access_point == segments[-1][-1].access_point:
            segments[-1].append(s)
        else:
            segments.append([s])
    return segments


def _two_opt_on_stops(
    stops: List[TourStop],
    start: Coord,
    matrix: np.ndarray,
    idx: Dict[Coord, int],
    max_iter: int,
) -> List[TourStop]:
    segments = _segments_from_stops(stops)
    if len(segments) < 4:
        return stops
    access_list = [seg[0].access_point for seg in segments]
    try:
        rep_idx = [idx[a] for a in access_list]
    except KeyError:
        return stops
    start_i = idx.get(start)
    tour = ([start_i] + rep_idx) if start_i is not None else rep_idx[:]
    improved = two_opt_improve(tour, matrix, max_iterations=max_iter)
    if start_i is not None and improved and improved[0] == start_i:
        improved = improved[1:]
    seg_by_idx = {idx[access_list[i]]: segments[i] for i in range(len(segments))}
    new_segments = [seg_by_idx[i] for i in improved if i in seg_by_idx]
    if len(new_segments) != len(segments):
        return stops
    return [s for seg in new_segments for s in seg]


def _unique_shelf_legs(
    accesses: List[Coord],
    start: Coord,
    end: Optional[Coord],
    matrix,
    idx,
    grid,
) -> List[Tuple[float, Optional[int], Optional[int]]]:
    """Unique-shelf hops as (grid_dist, c_seg_idx|None, d_seg_idx|None)."""
    legs: List[Tuple[float, Optional[int], Optional[int]]] = []
    n = len(accesses)
    if n == 0:
        return legs
    legs.append((_dist(matrix, idx, start, accesses[0], grid), None, 0))
    for i in range(n - 1):
        legs.append((_dist(matrix, idx, accesses[i], accesses[i + 1], grid), i, i + 1))
    if end is not None:
        legs.append((_dist(matrix, idx, accesses[-1], end, grid), n - 1, None))
    return legs


def _k_nearest_segments(
    move_idx: int,
    accesses: List[Coord],
    matrix,
    idx,
    grid,
    k: int,
) -> List[Tuple[float, int]]:
    neighbors: List[Tuple[float, int]] = []
    move_access = accesses[move_idx]
    for j, access in enumerate(accesses):
        if j == move_idx:
            continue
        neighbors.append((_dist(matrix, idx, move_access, access, grid), j))
    neighbors.sort(key=lambda x: x[0])
    return neighbors[:k]


def _relocate_segment(
    segments: List[List[TourStop]],
    move_idx: int,
    neighbor_idx: int,
    place_after: bool,
) -> Optional[List[List[TourStop]]]:
    n = len(segments)
    if move_idx == neighbor_idx or move_idx < 0 or neighbor_idx < 0:
        return None
    if move_idx >= n or neighbor_idx >= n:
        return None
    if place_after and move_idx == neighbor_idx + 1:
        return None
    if not place_after and move_idx == neighbor_idx - 1:
        return None
    moved = segments[move_idx]
    rest = segments[:move_idx] + segments[move_idx + 1 :]
    adj = neighbor_idx if neighbor_idx < move_idx else neighbor_idx - 1
    insert_at = adj + 1 if place_after else adj
    return rest[:insert_at] + [moved] + rest[insert_at:]


def or_opt_longest_legs(
    stops: List[TourStop],
    start: Coord,
    end: Optional[Coord],
    matrix,
    idx,
    grid,
) -> List[TourStop]:
    """Or-opt-1 on unique-shelf clusters: relocate endpoints of long hops.

    Same-shelf 0-step batches stay together. The 2× nearest-neighbor check is
    only a candidate filter; a move is kept only if total tour length drops.
    """
    if not OROPT_ENABLED or len(stops) < 2:
        return stops

    for _ in range(OROPT_MAX_PASSES):
        segments = _segments_from_stops(stops)
        n = len(segments)
        if n < 3:
            break
        accesses = [seg[0].access_point for seg in segments]
        old_total = _total_tour_dist(stops, start, end, matrix, idx, grid)
        if old_total >= INF:
            break

        legs = _unique_shelf_legs(accesses, start, end, matrix, idx, grid)
        legs.sort(key=lambda x: x[0], reverse=True)

        improved = False
        for dist_cd, c_idx, d_idx in legs[:OROPT_MAX_LEGS]:
            if dist_cd <= 0 or dist_cd >= INF:
                continue
            for move_idx in (c_idx, d_idx):
                if move_idx is None:
                    continue
                neighbors = _k_nearest_segments(
                    move_idx, accesses, matrix, idx, grid, OROPT_NEIGHBORS
                )
                for dj, j in neighbors:
                    # Nearby-neighbor filter only; not a proof of improvement.
                    if dist_cd <= 2.0 * dj:
                        continue
                    for place_after in (False, True):
                        trial_segs = _relocate_segment(
                            segments, move_idx, j, place_after
                        )
                        if trial_segs is None:
                            continue
                        trial = [s for seg in trial_segs for s in seg]
                        new_total = _total_tour_dist(
                            trial, start, end, matrix, idx, grid
                        )
                        if new_total < old_total:
                            stops = trial
                            improved = True
                            break
                    if improved:
                        break
                if improved:
                    break
            if improved:
                break
        if not improved:
            break
    return stops


def relocate_outliers(
    stops: List[TourStop],
    groups: Dict[str, List[Candidate]],
    matrix: np.ndarray,
    idx: Dict[Coord, int],
    start: Coord,
    end: Optional[Coord],
    grid,
    k: int,
) -> List[TourStop]:
    if k <= GTSP_EXACT_MAX_K:
        return stops
    cap = relocate_outlier_cap(k)

    for _ in range(RELOCATE_MAX_PASSES):
        improved = False
        if len(stops) < 2:
            break

        leg_costs = []
        for i, s in enumerate(stops):
            prev = start if i == 0 else stops[i - 1].access_point
            nxt = end if i == len(stops) - 1 else stops[i + 1].access_point
            cost = _dist(matrix, idx, prev, s.access_point, grid)
            if nxt is not None:
                cost += _dist(matrix, idx, s.access_point, nxt, grid)
            leg_costs.append((cost, i, s))

        multi = [
            (c, i, s)
            for c, i, s in leg_costs
            if len(groups.get(s.upc, [])) > 1
        ]
        multi.sort(reverse=True, key=lambda x: x[0])

        for _, i, stop in multi[:cap]:
            alts = [
                c
                for c in groups[stop.upc]
                if _shelf_key(c.shelf_name, c.access_point)
                != _shelf_key(stop.shelf_name, stop.access_point)
            ]
            if not alts:
                continue
            best_stops = stops
            best_total = _total_tour_dist(stops, start, end, matrix, idx, grid)
            for alt in alts:
                trial = stops[:]
                trial[i] = TourStop(
                    upc=stop.upc,
                    shelf_name=alt.shelf_name,
                    access_point=alt.access_point,
                    loc_data=alt.loc_data,
                    item_name=stop.item_name,
                )
                total = _total_tour_dist(trial, start, end, matrix, idx, grid)
                if total < best_total:
                    best_total = total
                    best_stops = trial
                    improved = True
            stops = best_stops

        if not improved:
            break
    return stops


def _total_tour_dist(
    stops: List[TourStop],
    start: Coord,
    end: Optional[Coord],
    matrix,
    idx,
    grid,
) -> float:
    if not stops:
        return 0.0
    total = _dist(matrix, idx, start, stops[0].access_point, grid)
    for i in range(1, len(stops)):
        if stops[i].access_point == stops[i - 1].access_point:
            continue
        total += _dist(matrix, idx, stops[i - 1].access_point, stops[i].access_point, grid)
    if end and stops[-1].access_point != end:
        total += _dist(matrix, idx, stops[-1].access_point, end, grid)
    return total


def merge_nonconsecutive_shelves(
    stops: List[TourStop],
    matrix,
    idx,
    start: Coord,
    grid,
) -> List[TourStop]:
    for _ in range(COLLATION_MERGE_PASS):
        changed = False
        positions: Dict[ShelfKey, List[int]] = {}
        for i, s in enumerate(stops):
            sk = _shelf_key(s.shelf_name, s.access_point)
            positions.setdefault(sk, []).append(i)
        for sk, indices in positions.items():
            if len(indices) < 2:
                continue
            indices.sort()
            block = [stops[i] for i in indices]
            rest = [stops[i] for i in range(len(stops)) if i not in indices]
            for pos in range(len(rest) + 1):
                trial = rest[:pos] + block + rest[pos:]
                if _total_tour_dist(trial, start, None, matrix, idx, grid) < _total_tour_dist(
                    stops, start, None, matrix, idx, grid
                ):
                    stops = trial
                    changed = True
                    break
        if not changed:
            break
    return stops


def solve_tour(
    ctx,
    upc_to_data: dict,
    upcs: List[str],
    start: Coord,
    end: Optional[Coord] = None,
) -> Tuple[List[dict], List[str]]:
    """
    Returns (pick_entries, unreachable_upcs).
    """
    k = len(upcs)
    if k == 0:
        return [], []

    shelf_lookup = ctx.shelf_node_by_name
    groups, unreachable = build_candidates(upcs, upc_to_data, shelf_lookup)
    cluster_map = build_shelf_cluster_map(groups)

    matrix, idx, _coords = _build_matrix_context(
        groups, start, end, ctx.grid, ctx.tier, k
    )

    if k == 1:
        stops = _solve_trivial(groups, upcs, start, matrix, idx, ctx.grid)
    elif k <= GTSP_EXACT_MAX_K:
        stops = _solve_exact_dp(
            groups, upcs, start, matrix, idx, ctx.grid, cluster_map
        )
    else:
        stops = _solve_insertion(
            groups, upcs, start, matrix, idx, ctx.grid, cluster_map, ctx.tier, k
        )
        if matrix is not None and should_run_two_opt(ctx.tier, k):
            stops = _two_opt_on_stops(stops, start, matrix, idx, two_opt_iterations(k))
        # 2-opt reverses unique-shelf subsequences. Or-opt then relocates a
        # shelf cluster off a long hop (reorder only). relocate_outliers
        # afterwards only swaps which location a multi-SKU uses.
        if should_run_or_opt(k):
            stops = or_opt_longest_legs(
                stops, start, end, matrix, idx, ctx.grid
            )
        if matrix is not None:
            stops = relocate_outliers(
                stops, groups, matrix, idx, start, end, ctx.grid, k
            )
            stops = merge_nonconsecutive_shelves(
                stops, matrix, idx, start, ctx.grid
            )

    entries = _stops_to_entries(stops, matrix, idx, ctx.grid, start)

    for upc in unreachable:
        entries.append(
            {
                "upc": upc,
                "item_name": upc_to_data.get(upc, {}).get("item_name", "Unknown"),
                "shelf": "unknown",
                "shelf_data": None,
                "modular_location": None,
                "location": None,
                "unreachable": True,
            }
        )

    return entries, unreachable
