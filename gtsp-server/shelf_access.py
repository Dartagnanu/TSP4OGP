"""Shelf approach cells from template access (front / all_sides)."""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Set, Tuple

from polygon_grid import get_covered_cells, rotate_point, translated_rotated_shape
from walkability import Coord, WalkabilityGrid

INF_DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _footprint_cells(
    shape: list,
    placement_x: int,
    placement_y: int,
    rotation: float,
    grid: WalkabilityGrid,
) -> Set[Coord]:
    world_poly = translated_rotated_shape(shape, placement_x, placement_y, rotation)
    covered: Set[Coord] = set()
    for wx, wy in get_covered_cells(world_poly):
        cx, cy = int(round(wx)), int(round(wy))
        if 0 <= cx < grid.width and 0 <= cy < grid.height:
            covered.add((cx, cy))
    return covered


def _local_bounds(local_shape: List[Tuple[float, float]]) -> Tuple[float, float, float, float]:
    xs = [p[0] for p in local_shape]
    ys = [p[1] for p in local_shape]
    return min(xs), max(xs), min(ys), max(ys)


def _front_approach_cells(
    local_shape: List[Tuple[float, float]],
    placement_x: int,
    placement_y: int,
    covered: Set[Coord],
    grid: WalkabilityGrid,
    rotation: float,
) -> Set[Coord]:
    """Front = +Y local (arrow direction); approach cells just outside max-Y edge."""
    _, _, _, max_ly = _local_bounds(local_shape)
    outward_dx, outward_dy = rotate_point(0, 1, rotation)
    step_x = int(round(outward_dx)) if abs(outward_dx) >= 0.5 else 0
    step_y = int(round(outward_dy)) if abs(outward_dy) >= 0.5 else (1 if outward_dy >= 0 else -1)
    if step_x == 0 and step_y == 0:
        step_y = 1

    approach: Set[Coord] = set()
    tol = 0.6
    n = len(local_shape)
    for i in range(n):
        x1, y1 = local_shape[i]
        x2, y2 = local_shape[(i + 1) % n]
        if y1 < max_ly - tol and y2 < max_ly - tol:
            continue
        wx1, wy1 = placement_x + x1, placement_y + y1
        wx2, wy2 = placement_x + x2, placement_y + y2
        steps = max(int(math.hypot(wx2 - wx1, wy2 - wy1)), 1)
        for t in range(steps + 1):
            fx = wx1 + (wx2 - wx1) * t / steps
            fy = wy1 + (wy2 - wy1) * t / steps
            ax = int(round(fx + step_x))
            ay = int(round(fy + step_y))
            if 0 <= ax < grid.width and 0 <= ay < grid.height and (ax, ay) not in covered:
                approach.add((ax, ay))
    return approach


def _all_sides_approach_cells(
    covered: Set[Coord],
    grid: WalkabilityGrid,
) -> Set[Coord]:
    approach: Set[Coord] = set()
    for cx, cy in covered:
        for dx, dy in INF_DIRS:
            nx, ny = cx + dx, cy + dy
            if (nx, ny) in covered:
                continue
            if 0 <= nx < grid.width and 0 <= ny < grid.height:
                approach.add((nx, ny))
    return approach


def resolve_access_points(
    shelf: dict,
    template: dict,
    grid: WalkabilityGrid,
) -> Tuple[List[Coord], Optional[Coord], bool]:
    """
    Returns (access_points, primary_access, accessible).
    Front = +Y local edge (arrow direction), rotated by shelf.rotation.
    """
    shape = template.get("shape") or []
    if not shape:
        return [], None, False

    access_mode = template.get("access", "front")
    rotation = float(shelf.get("rotation", 0))
    placement_x = int(shelf["placement_x"])
    placement_y = int(shelf["placement_y"])

    covered = _footprint_cells(shape, placement_x, placement_y, rotation, grid)
    local_shape = [rotate_point(x, y, rotation) for x, y in shape]

    if access_mode == "front":
        approach = _front_approach_cells(
            local_shape, placement_x, placement_y, covered, grid, rotation
        )
    else:
        approach = _all_sides_approach_cells(covered, grid)

    # Keep cells that are walkable or blocked only by this shelf footprint
    valid: Set[Coord] = set()
    for ax, ay in approach:
        if grid.is_walkable(ax, ay):
            valid.add((ax, ay))

    if not valid:
        return [], None, False

    def aisle_score(coord: Coord) -> Tuple[int, float]:
        x, y = coord
        neighbors = sum(
            1 for dx, dy in INF_DIRS if grid.is_walkable(x + dx, y + dy)
        )
        dist_c = math.hypot(x - placement_x, y - placement_y)
        return (neighbors, -dist_c)

    ordered = sorted(valid, key=aisle_score, reverse=True)
    primary = ordered[0]
    return ordered, primary, True


def build_shelf_node(
    shelf: dict,
    template: dict,
    grid: WalkabilityGrid,
) -> dict:
    placement_x = int(shelf["placement_x"])
    placement_y = int(shelf["placement_y"])
    access_points, primary, accessible = resolve_access_points(shelf, template, grid)

    for ax, ay in access_points:
        if 0 <= ax < grid.width and 0 <= ay < grid.height:
            grid.walkable[ay, ax] = True

    node = {
        "shelf_name": shelf.get("shelf_name", ""),
        "x": placement_x,
        "y": placement_y,
        "shelf_id": str(shelf.get("_id", "")),
        "access_points": [list(c) for c in access_points],
        "accessible": accessible,
    }
    if primary:
        node["primary_access"] = list(primary)
    return node


def shelf_node_lookup(shelf_nodes: List[dict]) -> Dict[str, dict]:
    out: Dict[str, dict] = {}
    for n in shelf_nodes:
        name = str(n.get("shelf_name") or "")
        if name:
            out[name] = n
        sid = str(n.get("shelf_id") or "")
        if sid:
            out[sid] = n
    return out
