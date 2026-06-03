"""Shelf-to-shelf distance matrix and 2-opt tour improvement."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np

from pathfinder_config import should_build_matrix, should_run_two_opt
from walkability import Coord, WalkabilityGrid

INF = float("inf")


def build_shelf_matrix(
    grid: WalkabilityGrid,
    shelf_coords: List[Coord],
    gpu_available: bool = False,
) -> Optional[np.ndarray]:
    """Full n x n distance matrix between shelf access points."""
    n = len(shelf_coords)
    if n == 0:
        return None
    matrix = np.full((n, n), INF, dtype=np.float64)
    np.fill_diagonal(matrix, 0.0)

    # CPU BFS from each shelf (GPU batch deferred to pathfinder_config gate)
    for i, start in enumerate(shelf_coords):
        field = grid.bfs_distance_field(start)
        for j, (tx, ty) in enumerate(shelf_coords):
            if i == j:
                continue
            if 0 <= ty < grid.height and 0 <= tx < grid.width:
                d = int(field[ty, tx])
                if d >= 0:
                    matrix[i, j] = float(d)
    return matrix


def matrix_distance(
    matrix: Optional[np.ndarray],
    coord_to_index: Dict[Coord, int],
    a: Coord,
    b: Coord,
) -> float:
    if matrix is None:
        return INF
    ia = coord_to_index.get(a)
    ib = coord_to_index.get(b)
    if ia is None or ib is None:
        return INF
    return float(matrix[ia, ib])


def two_opt_improve(
    tour_indices: List[int],
    matrix: np.ndarray,
    max_iterations: int = 500,
) -> List[int]:
    """2-opt on a tour of shelf indices (open path, fixed start)."""
    if len(tour_indices) < 4:
        return tour_indices

    tour = tour_indices[:]
    n = len(tour)

    def tour_length(seq: List[int]) -> float:
        total = 0.0
        for i in range(len(seq) - 1):
            d = matrix[seq[i], seq[i + 1]]
            if d >= INF:
                return INF
            total += d
        return total

    improved = True
    it = 0
    while improved and it < max_iterations:
        improved = False
        it += 1
        for i in range(1, n - 2):
            for j in range(i + 1, n):
                if j - i == 1:
                    continue
                a, b = tour[i - 1], tour[i]
                c, d = tour[j - 1], tour[j]
                old_cost = matrix[a, b] + matrix[c, d]
                new_cost = matrix[a, c] + matrix[b, d]
                if new_cost < old_cost - 1e-9:
                    tour[i:j] = reversed(tour[i:j])
                    improved = True
    return tour


def reorder_picks_by_tour(
    pick_entries: List[dict],
    tour_indices: List[int],
    shelf_coord_for_pick: List[Coord],
    coord_to_index: Dict[Coord, int],
) -> List[dict]:
    """Reorder pick list entries to match 2-opt shelf tour (same UPC entries)."""
    if not pick_entries or len(tour_indices) != len(shelf_coord_for_pick):
        return pick_entries

    index_to_pick = {}
    for entry, coord in zip(pick_entries, shelf_coord_for_pick):
        idx = coord_to_index.get(coord)
        if idx is not None and idx not in index_to_pick:
            index_to_pick[idx] = entry

    reordered = []
    prev_coord = None
    for idx in tour_indices:
        entry = index_to_pick.get(idx)
        if entry is None:
            continue
        coord = shelf_coord_for_pick[tour_indices.index(idx)] if idx in tour_indices else None
        # Recompute distance_from_previous if we have matrix context in entry
        reordered.append(entry)
    # Simpler: map pick by coord index
    ordered = []
    for idx in tour_indices:
        for entry, coord in zip(pick_entries, shelf_coord_for_pick):
            if coord_to_index.get(coord) == idx:
                ordered.append(entry)
                break
    return ordered if ordered else pick_entries
