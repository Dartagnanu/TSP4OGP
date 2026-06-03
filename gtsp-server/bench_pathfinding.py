#!/usr/bin/env python3
"""Benchmark grid BFS pathfinding (no Mongo required for synthetic cases)."""
import argparse
import time

import numpy as np

from pathfinder_config import tier_for_walkable_count
from walkability import WalkabilityGrid


def make_grid(width: int, height: int, obstacle_fraction: float = 0.3) -> WalkabilityGrid:
    rng = np.random.default_rng(42)
    walkable = rng.random((height, width)) > obstacle_fraction
    walkable[0, 0] = True
    walkable[height // 2, width // 2] = True
    return WalkabilityGrid(width, height, walkable)


def bench_bfs_per_step(width: int, height: int, k: int, reps: int = 3) -> dict:
    grid = make_grid(width, height)
    tier = tier_for_walkable_count(grid.walkable_count)
    start = (0, 0)
    targets = [(i % width, (i * 7) % height) for i in range(k)]

    times = []
    for _ in range(reps):
        t0 = time.perf_counter()
        current = start
        for _ in range(k):
            field = grid.bfs_distance_field(current)
            candidates = [
                (int(field[ty, tx]), (tx, ty))
                for tx, ty in targets
                if 0 <= tx < width and 0 <= ty < height and field[ty, tx] >= 0
            ]
            if not candidates:
                break
            current = min(candidates)[1]
        times.append(time.perf_counter() - t0)

    return {
        "width": width,
        "height": height,
        "walkable": grid.walkable_count,
        "tier": tier,
        "k": k,
        "bfs_per_step": k,
        "mean_sec": sum(times) / len(times),
    }


def main():
    parser = argparse.ArgumentParser(description="Pathfinder grid benchmarks")
    parser.add_argument("--case", choices=["s", "m", "l", "xl", "all"], default="all")
    args = parser.parse_args()

    cases = []
    if args.case in ("s", "all"):
        cases.append((50, 30, 10))
    if args.case in ("m", "all"):
        cases.append((200, 150, 30))
    if args.case in ("l", "all"):
        cases.append((600, 500, 50))
    if args.case in ("xl", "all"):
        cases.append((1000, 500, 50))

    print("case\twalkable\ttier\tk\tmean_sec\tbfs_calls")
    for w, h, k in cases:
        r = bench_bfs_per_step(w, h, k)
        print(
            f"{w}x{h}\t{r['walkable']}\t{r['tier']}\t{k}\t"
            f"{r['mean_sec']:.4f}\t{r['bfs_per_step']}"
        )


if __name__ == "__main__":
    main()
