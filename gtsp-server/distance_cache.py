"""Coordinate distance matrix and 2-opt tour improvement."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np

from walkability import Coord, WalkabilityGrid

INF = float("inf")


def build_coord_matrix(
    grid: WalkabilityGrid,
    coords: List[Coord],
) -> Optional[np.ndarray]:
    """Full n x n BFS distance matrix between grid coordinates."""
    n = len(coords)
    if n == 0:
        return None
    matrix = np.full((n, n), INF, dtype=np.float64)
    np.fill_diagonal(matrix, 0.0)

    for i, start in enumerate(coords):
        field = grid.bfs_distance_field(start)
        for j, (tx, ty) in enumerate(coords):
            if i == j:
                continue
            if 0 <= ty < grid.height and 0 <= tx < grid.width:
                d = int(field[ty, tx])
                if d >= 0:
                    matrix[i, j] = float(d)
    return matrix


def build_shelf_matrix(
    grid: WalkabilityGrid,
    shelf_coords: List[Coord],
    gpu_available: bool = False,
) -> Optional[np.ndarray]:
    """Backward-compatible shelf matrix builder."""
    return build_coord_matrix(grid, shelf_coords)


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
    if ia == ib:
        return 0.0
    return float(matrix[ia, ib])


def tour_length(indices: List[int], matrix: np.ndarray) -> float:
    total = 0.0
    for i in range(len(indices) - 1):
        d = matrix[indices[i], indices[i + 1]]
        if d >= INF:
            return INF
        total += d
    return total


def two_opt_improve(
    tour_indices: List[int],
    matrix: np.ndarray,
    max_iterations: int = 500,
) -> List[int]:
    """2-opt on a tour of matrix indices (open path)."""
    if len(tour_indices) < 4:
        return tour_indices

    tour = tour_indices[:]
    n = len(tour)

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
