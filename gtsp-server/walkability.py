"""Compact grid walkability and BFS distance fields for store pathfinding."""
from __future__ import annotations

from collections import deque
from typing import Dict, List, Optional, Tuple

import numpy as np

Coord = Tuple[int, int]


class WalkabilityGrid:
    """Boolean walkability mask (height x width). True = walkable."""

    __slots__ = ("width", "height", "walkable", "walkable_count")

    def __init__(self, width: int, height: int, walkable: np.ndarray):
        self.width = width
        self.height = height
        self.walkable = walkable  # bool ndarray shape (height, width)
        self.walkable_count = int(np.count_nonzero(walkable))

    @staticmethod
    def pack_bits(walkable: np.ndarray) -> bytes:
        flat = np.ascontiguousarray(walkable, dtype=np.bool_).ravel()
        return np.packbits(flat, bitorder="little").tobytes()

    @staticmethod
    def unpack_bits(data: bytes, width: int, height: int) -> np.ndarray:
        n_cells = width * height
        bits = np.unpackbits(np.frombuffer(data, dtype=np.uint8), bitorder="little")
        if bits.size < n_cells:
            pad = np.zeros(n_cells - bits.size, dtype=np.uint8)
            bits = np.concatenate([bits, pad])
        return bits[:n_cells].reshape((height, width)).astype(np.bool_)

    def is_walkable(self, x: int, y: int) -> bool:
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return False
        return bool(self.walkable[y, x])

    def snap_to_walkable(self, point: Coord, max_radius: int = 30) -> Coord:
        """Nearest walkable cell in grid steps, or the original point if none."""
        sx, sy = int(point[0]), int(point[1])
        if self.is_walkable(sx, sy):
            return (sx, sy)
        seen = {(sx, sy)}
        q: deque = deque([(sx, sy, 0)])
        while q:
            x, y, r = q.popleft()
            if r >= max_radius:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if (nx, ny) in seen:
                    continue
                if nx < 0 or ny < 0 or nx >= self.width or ny >= self.height:
                    continue
                seen.add((nx, ny))
                if self.walkable[ny, nx]:
                    return (nx, ny)
                q.append((nx, ny, r + 1))
        return (sx, sy)

    def bfs_distance_field(self, start: Coord) -> np.ndarray:
        """
        4-neighbor BFS from start. Returns int32 array (height, width);
        -1 = unreachable / not walkable.
        """
        sx, sy = int(start[0]), int(start[1])
        dist = np.full((self.height, self.width), -1, dtype=np.int32)
        if not self.is_walkable(sx, sy):
            return dist

        q: deque = deque()
        dist[sy, sx] = 0
        q.append((sx, sy))
        while q:
            x, y = q.popleft()
            d = dist[y, x]
            for nx_, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx_ < self.width and 0 <= ny < self.height:
                    if self.walkable[ny, nx_] and dist[ny, nx_] < 0:
                        dist[ny, nx_] = d + 1
                        q.append((nx_, ny))
        return dist

    def distance_between(self, start: Coord, end: Coord) -> float:
        field = self.bfs_distance_field(start)
        ex, ey = int(end[0]), int(end[1])
        if ey < 0 or ey >= self.height or ex < 0 or ex >= self.width:
            return float("inf")
        d = int(field[ey, ex])
        return float(d) if d >= 0 else float("inf")

    def distances_to_coords(
        self, start: Coord, targets: List[Coord]
    ) -> Dict[Coord, float]:
        field = self.bfs_distance_field(start)
        out: Dict[Coord, float] = {}
        for tx, ty in targets:
            if ty < 0 or ty >= self.height or tx < 0 or tx >= self.width:
                out[(tx, ty)] = float("inf")
                continue
            d = int(field[ty, tx])
            out[(tx, ty)] = float(d) if d >= 0 else float("inf")
        return out

    def estimate_bytes(self) -> int:
        return self.walkable.nbytes
