"""Compact grid walkability and BFS distance fields for store pathfinding."""
from __future__ import annotations

from collections import OrderedDict, deque
from typing import Dict, Iterable, List, Optional, Set, Tuple

import numpy as np

Coord = Tuple[int, int]

# Cap so a forgotten clear cannot pin hundreds of full grids in the store cache.
_FIELD_CACHE_MAX = 1024


class WalkabilityGrid:
    """Boolean walkability mask (height x width). True = walkable."""

    __slots__ = (
        "width",
        "height",
        "walkable",
        "walkable_count",
        "_field_cache",
        "bfs_compute_count",
        "last_matrix_seconds",
        "last_solve_seconds",
    )

    def __init__(self, width: int, height: int, walkable: np.ndarray):
        self.width = width
        self.height = height
        self.walkable = walkable  # bool ndarray shape (height, width)
        self.walkable_count = int(np.count_nonzero(walkable))
        self._field_cache: "OrderedDict[Coord, Tuple[np.ndarray, bool]]" = OrderedDict()
        self.bfs_compute_count = 0
        self.last_matrix_seconds = 0.0
        self.last_solve_seconds = 0.0

    def clear_field_cache(self) -> None:
        """Drop cached BFS fields and reset the compute counter (per-request)."""
        self._field_cache.clear()
        self.bfs_compute_count = 0

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

    def _cache_get(self, key: Coord) -> Optional[Tuple[np.ndarray, bool]]:
        entry = self._field_cache.get(key)
        if entry is None:
            return None
        self._field_cache.move_to_end(key)
        return entry

    def _cache_put(self, key: Coord, field: np.ndarray, complete: bool) -> None:
        self._field_cache[key] = (field, complete)
        self._field_cache.move_to_end(key)
        while len(self._field_cache) > _FIELD_CACHE_MAX:
            self._field_cache.popitem(last=False)

    def _walkable_targets(self, start: Coord, targets: Iterable[Coord]) -> Set[Coord]:
        sx, sy = start
        remaining: Set[Coord] = set()
        for t in targets:
            tx, ty = int(t[0]), int(t[1])
            if (tx, ty) == (sx, sy):
                continue
            if ty < 0 or ty >= self.height or tx < 0 or tx >= self.width:
                continue
            if not self.walkable[ty, tx]:
                continue
            remaining.add((tx, ty))
        return remaining

    def _field_covers(self, field: np.ndarray, remaining: Set[Coord]) -> bool:
        for tx, ty in remaining:
            if int(field[ty, tx]) < 0:
                return False
        return True

    def _bfs_compute(
        self,
        start: Coord,
        remaining: Optional[Set[Coord]],
    ) -> Tuple[np.ndarray, bool]:
        """4-neighbor BFS. remaining=None means fill the whole reachable component."""
        sx, sy = start
        dist = np.full((self.height, self.width), -1, dtype=np.int32)
        if not self.is_walkable(sx, sy):
            return dist, True

        left: Optional[Set[Coord]] = None if remaining is None else set(remaining)
        q: deque = deque()
        dist[sy, sx] = 0
        q.append((sx, sy))
        if left is not None:
            left.discard((sx, sy))
            if not left:
                return dist, False

        while q:
            x, y = q.popleft()
            d = dist[y, x]
            for nx_, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx_ < self.width and 0 <= ny < self.height:
                    if self.walkable[ny, nx_] and dist[ny, nx_] < 0:
                        dist[ny, nx_] = d + 1
                        q.append((nx_, ny))
                        if left is not None:
                            left.discard((nx_, ny))
                            if not left:
                                return dist, False
        return dist, True

    def bfs_distance_field(
        self,
        start: Coord,
        targets: Optional[Iterable[Coord]] = None,
    ) -> np.ndarray:
        """
        4-neighbor BFS from start. Returns int32 array (height, width);
        -1 = unreachable / not walkable / (if targets given) not yet visited.

        Cached per start cell. When ``targets`` is set, search stops once every
        walkable in-bounds target is reached (same distances for those cells).
        """
        key: Coord = (int(start[0]), int(start[1]))
        remaining: Optional[Set[Coord]] = None
        if targets is not None:
            remaining = self._walkable_targets(key, targets)

        cached = self._cache_get(key)
        if cached is not None:
            field, complete = cached
            if complete:
                return field
            if remaining is not None and self._field_covers(field, remaining):
                return field

        self.bfs_compute_count += 1
        field, complete = self._bfs_compute(key, remaining)
        old = self._field_cache.get(key)
        if old is not None and not complete:
            old_field, _old_complete = old
            merged = old_field.copy()
            fill = (merged < 0) & (field >= 0)
            merged[fill] = field[fill]
            field = merged
        self._cache_put(key, field, complete)
        return field

    def distance_between(self, start: Coord, end: Coord) -> float:
        ex, ey = int(end[0]), int(end[1])
        if ey < 0 or ey >= self.height or ex < 0 or ex >= self.width:
            return float("inf")
        field = self.bfs_distance_field(start, targets=[(ex, ey)])
        d = int(field[ey, ex])
        return float(d) if d >= 0 else float("inf")

    def distances_to_coords(
        self, start: Coord, targets: List[Coord]
    ) -> Dict[Coord, float]:
        field = self.bfs_distance_field(start, targets=targets)
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
