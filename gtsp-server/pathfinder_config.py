"""Pathfinder tuning via environment variables (multi-store / multi-pod)."""
import os

TIER_S_MAX = int(os.environ.get("PATHFINDER_TIER_S_CELLS", "10000"))
TIER_M_MAX = int(os.environ.get("PATHFINDER_TIER_M_CELLS", "100000"))
MATRIX_MAX_SHELVES = int(os.environ.get("PATHFINDER_MATRIX_MAX_SHELVES", "500"))
MATRIX_MAX_ENTRIES = int(os.environ.get("PATHFINDER_MATRIX_MAX_ENTRIES", "250000"))
TIER_M_MATRIX_SHELVES = int(os.environ.get("PATHFINDER_TIER_M_MATRIX_SHELVES", "300"))
MAX_CACHED_STORES = int(os.environ.get("PATHFINDER_MAX_CACHED_STORES", "50"))
MAX_CACHE_MB = int(os.environ.get("PATHFINDER_MAX_CACHE_MB", "512"))
TWO_OPT_MAX_K = int(os.environ.get("PATHFINDER_TWO_OPT_MAX_K", "80"))
MAX_MAP_WIDTH = int(os.environ.get("PATHFINDER_MAX_MAP_WIDTH", "2000"))
MAX_MAP_HEIGHT = int(os.environ.get("PATHFINDER_MAX_MAP_HEIGHT", "2500"))
# Use GPU cuGraph only for batch matrix precompute when True and GPU available
GPU_MATRIX_PRECOMPUTE = os.environ.get("PATHFINDER_GPU_MATRIX_PRECOMPUTE", "1").lower() in (
    "1",
    "true",
    "yes",
)


def tier_for_walkable_count(walkable_count: int) -> str:
    if walkable_count < TIER_S_MAX:
        return "S"
    if walkable_count < TIER_M_MAX:
        return "M"
    return "L"


def should_build_matrix(tier: str, n_shelves: int) -> bool:
    if n_shelves <= 0:
        return False
    if n_shelves * n_shelves > MATRIX_MAX_ENTRIES:
        return False
    if n_shelves > MATRIX_MAX_SHELVES:
        return False
    if tier == "S":
        return False
    if tier == "M":
        return n_shelves <= TIER_M_MATRIX_SHELVES
    return True


def should_run_two_opt(tier: str, k: int) -> bool:
    if k > TWO_OPT_MAX_K:
        return False
    return tier in ("M", "L")
