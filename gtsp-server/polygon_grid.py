"""Grid polygon fill (matches client gridBuilder ray-casting)."""
from __future__ import annotations

import math
from typing import List, Sequence, Tuple

Coord = Tuple[int, int]


def rotate_point(x: float, y: float, angle_deg: float) -> Tuple[float, float]:
    rad = math.radians(angle_deg)
    return (
        x * math.cos(rad) - y * math.sin(rad),
        x * math.sin(rad) + y * math.cos(rad),
    )


def point_in_polygon(px: float, py: float, polygon: Sequence[Sequence[float]]) -> bool:
    inside = False
    n = len(polygon)
    for i in range(n):
        j = (i - 1) % n
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        denom = yj - yi
        if denom == 0:
            continue
        intersect = ((yi > py) != (yj > py)) and (
            px < (xj - xi) * (py - yi) / denom + xi
        )
        if intersect:
            inside = not inside
    return inside


def get_covered_cells(polygon: Sequence[Sequence[float]]) -> List[Coord]:
    if not polygon:
        return []
    min_x = min(p[0] for p in polygon)
    min_y = min(p[1] for p in polygon)
    max_x = max(p[0] for p in polygon)
    max_y = max(p[1] for p in polygon)
    cells: List[Coord] = []
    for x in range(int(math.floor(min_x)), int(math.ceil(max_x)) + 1):
        for y in range(int(math.floor(min_y)), int(math.ceil(max_y)) + 1):
            if point_in_polygon(x + 0.5, y + 0.5, polygon):
                cells.append((x, y))
    return cells


def translated_rotated_shape(
    shape: Sequence[Sequence[float]],
    placement_x: int,
    placement_y: int,
    rotation: float,
) -> List[Tuple[float, float]]:
    return [
        (
            placement_x + rotate_point(x, y, rotation)[0],
            placement_y + rotate_point(x, y, rotation)[1],
        )
        for x, y in shape
    ]
