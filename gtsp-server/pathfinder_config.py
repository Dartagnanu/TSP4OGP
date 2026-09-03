"""Pathfinder tuning via environment variables (multi-store / multi-pod)."""
import os

TIER_S_MAX = int(os.environ.get("PATHFINDER_TIER_S_CELLS", "10000"))
TIER_M_MAX = int(os.environ.get("PATHFINDER_TIER_M_CELLS", "100000"))
MATRIX_MAX_SHELVES = int(os.environ.get("PATHFINDER_MATRIX_MAX_SHELVES", "500"))
MATRIX_MAX_ENTRIES = int(os.environ.get("PATHFINDER_MATRIX_MAX_ENTRIES", "250000"))
TIER_M_MATRIX_SHELVES = int(os.environ.get("PATHFINDER_TIER_M_MATRIX_SHELVES", "300"))
MAX_CACHED_STORES = int(os.environ.get("PATHFINDER_MAX_CACHED_STORES", "50"))
MAX_CACHE_MB = int(os.environ.get("PATHFINDER_MAX_CACHE_MB", "512"))
TWO_OPT_MAX_K = int(os.environ.get("PATHFINDER_TWO_OPT_MAX_K", "150"))
TWO_OPT_FULL_K = int(os.environ.get("PATHFINDER_TWO_OPT_FULL_K", "80"))
TWO_OPT_MAX_ITER = int(os.environ.get("PATHFINDER_TWO_OPT_MAX_ITER", "50"))
TWO_OPT_FULL_ITER = int(os.environ.get("PATHFINDER_TWO_OPT_FULL_ITER", "500"))
MAX_MAP_WIDTH = int(os.environ.get("PATHFINDER_MAX_MAP_WIDTH", "2000"))
MAX_MAP_HEIGHT = int(os.environ.get("PATHFINDER_MAX_MAP_HEIGHT", "2500"))
GTSP_EXACT_MAX_K = int(os.environ.get("PATHFINDER_GTSP_EXACT_MAX_K", "12"))
MATRIX_MIN_K = int(os.environ.get("PATHFINDER_MATRIX_MIN_K", "13"))
COLLATION_WEIGHT = float(os.environ.get("PATHFINDER_COLLATION_WEIGHT", "2"))
COLLATION_MERGE_PASS = int(os.environ.get("PATHFINDER_COLLATION_MERGE_PASS", "1"))
RELOCATE_MAX_OUTLIERS = int(os.environ.get("PATHFINDER_RELOCATE_MAX_OUTLIERS", "3"))
RELOCATE_MAX_PASSES = int(os.environ.get("PATHFINDER_RELOCATE_MAX_PASSES", "2"))
RELOCATE_LARGE_K_THRESHOLD = int(os.environ.get("PATHFINDER_RELOCATE_LARGE_K", "50"))
RELOCATE_MAX_OUTLIERS_LARGE = int(os.environ.get("PATHFINDER_RELOCATE_MAX_OUTLIERS_LARGE", "5"))
OROPT_ENABLED = os.environ.get("PATHFINDER_OROPT", "1").lower() in ("1", "true", "yes")
OROPT_MAX_LEGS = int(os.environ.get("PATHFINDER_OROPT_MAX_LEGS", "8"))
OROPT_NEIGHBORS = int(os.environ.get("PATHFINDER_OROPT_NEIGHBORS", "5"))
OROPT_MAX_PASSES = int(os.environ.get("PATHFINDER_OROPT_MAX_PASSES", "3"))

WALKABILITY_FORMAT = "walkability_v2"

GPU_MATRIX_PRECOMPUTE = os.environ.get("PATHFINDER_GPU_MATRIX_PRECOMPUTE", "1").lower() in (
    "1",
    "true",
    "yes",
)
GPU_PROBE = os.environ.get("PATHFINDER_GPU_PROBE", "1").lower() in ("1", "true", "yes")
GPU_PROBE_TIMEOUT_SEC = float(os.environ.get("PATHFINDER_GPU_PROBE_TIMEOUT_SEC", "5"))


def tier_for_walkable_count(walkable_count: int) -> str:
    if walkable_count < TIER_S_MAX:
        return "S"
    if walkable_count < TIER_M_MAX:
        return "M"
    return "L"


def should_build_matrix(tier: str, n_nodes: int, pick_count: int = 0) -> bool:
    if n_nodes <= 0:
        return False
    if pick_count >= MATRIX_MIN_K:
        if n_nodes * n_nodes <= MATRIX_MAX_ENTRIES and n_nodes <= MATRIX_MAX_SHELVES:
            return True
    if n_nodes * n_nodes > MATRIX_MAX_ENTRIES:
        return False
    if n_nodes > MATRIX_MAX_SHELVES:
        return False
    if tier == "S":
        return False
    if tier == "M":
        return n_nodes <= TIER_M_MATRIX_SHELVES
    return True


def should_run_two_opt(tier: str, k: int) -> bool:
    if k > TWO_OPT_MAX_K:
        return False
    if k >= MATRIX_MIN_K:
        return True
    return tier in ("M", "L") or k >= MATRIX_MIN_K


def two_opt_iterations(k: int) -> int:
    if k <= TWO_OPT_FULL_K:
        return TWO_OPT_FULL_ITER
    return TWO_OPT_MAX_ITER


def relocate_outlier_cap(k: int) -> int:
    if k > RELOCATE_LARGE_K_THRESHOLD:
        return RELOCATE_MAX_OUTLIERS_LARGE
    return RELOCATE_MAX_OUTLIERS


def should_run_or_opt(k: int) -> bool:
    """Or-opt runs on the insertion heuristic branch only (not exact DP)."""
    if not OROPT_ENABLED:
        return False
    return k > GTSP_EXACT_MAX_K
