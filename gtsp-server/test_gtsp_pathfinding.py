#!/usr/bin/env python3
"""Unit tests for GTSP pathfinding (no Mongo)."""
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import numpy as np

from graphBuilder import GraphBuilder, timestamps_equal
from gtsp_solver import (
    TourStop,
    _total_tour_dist,
    build_candidates,
    build_shelf_cluster_map,
    or_opt_longest_legs,
    solve_tour,
)
from pathfinder_config import GTSP_EXACT_MAX_K, should_run_or_opt
from polygon_grid import get_covered_cells, point_in_polygon
from shelf_access import resolve_access_points
from store_cache import StoreCache, StoreContext
from walkability import WalkabilityGrid


def _tiny_store():
    return {
        "map_size": {"width": 20, "height": 20},
        "shelf_templates": {
            "standard_shelf": {
                "shape": [[0, 0], [0, 2], [4, 2], [4, 0]],
                "access": "front",
            },
            "feature_bin": {
                "shape": [[0, 0], [0, 4], [4, 4], [4, 0]],
                "access": "all_sides",
            },
        },
    }


class TestPolygonFill(unittest.TestCase):
    def test_interior_filled(self):
        poly = [[0, 0], [0, 2], [4, 2], [4, 0]]
        cells = get_covered_cells(poly)
        self.assertIn((2, 1), cells)
        self.assertGreater(len(cells), 4)


class TestWalkabilityBuild(unittest.TestCase):
    def test_shelf_blocks_interior(self):
        store = _tiny_store()
        shelves = [
            {
                "shelf_name": "s1",
                "template": "standard_shelf",
                "placement_x": 5,
                "placement_y": 5,
                "rotation": 0,
            }
        ]
        gb = GraphBuilder(db=None)
        grid, nodes = gb.build_walkability(store, shelves)
        self.assertFalse(grid.is_walkable(6, 6))
        self.assertTrue(nodes[0].get("accessible"))


class TestSnapToWalkable(unittest.TestCase):
    def test_snaps_out_of_blocked_cell(self):
        walkable = np.ones((10, 10), dtype=np.bool_)
        walkable[5:8, 5:8] = False
        grid = WalkabilityGrid(10, 10, walkable)
        self.assertFalse(grid.is_walkable(6, 6))
        snapped = grid.snap_to_walkable((6, 6))
        self.assertTrue(grid.is_walkable(*snapped))
        self.assertEqual(abs(snapped[0] - 6) + abs(snapped[1] - 6), 2)

    def test_keeps_walkable_point(self):
        walkable = np.ones((8, 8), dtype=np.bool_)
        grid = WalkabilityGrid(8, 8, walkable)
        self.assertEqual(grid.snap_to_walkable((3, 3)), (3, 3))


class TestShelfAccess(unittest.TestCase):
    def test_front_access_open_aisle(self):
        store = _tiny_store()
        shelf = {
            "placement_x": 5,
            "placement_y": 5,
            "rotation": 0,
        }
        template = store["shelf_templates"]["standard_shelf"]
        walkable = np.ones((20, 20), dtype=np.bool_)
        for x, y in get_covered_cells(
            [[5 + p[0], 5 + p[1]] for p in template["shape"]]
        ):
            walkable[y, x] = False
        grid = WalkabilityGrid(20, 20, walkable)
        points, primary, ok = resolve_access_points(shelf, template, grid)
        self.assertTrue(ok)
        self.assertIsNotNone(primary)
        self.assertTrue(all(py >= 6 for _, py in points))


class TestGtspSolver(unittest.TestCase):
    def _ctx(self, grid, nodes):
        return StoreContext(
            store_number=1,
            grid=grid,
            shelf_nodes=nodes,
            shelves_hash="test",
            tier="S",
            walkable_count=grid.walkable_count,
            n_shelves=len(nodes),
            shelf_coords=[],
            coord_to_shelf_index={},
            shelf_node_by_name={n["shelf_name"]: n for n in nodes},
        )

    def test_k1_trivial(self):
        store = _tiny_store()
        shelves = [
            {
                "_id": "a",
                "shelf_name": "s1",
                "template": "standard_shelf",
                "placement_x": 5,
                "placement_y": 5,
                "rotation": 0,
            }
        ]
        gb = GraphBuilder(db=None)
        grid, nodes = gb.build_walkability(store, shelves)
        ctx = self._ctx(grid, nodes)
        node = nodes[0]
        access = tuple(node["primary_access"])
        upc_to_data = {
            "U1": {
                "item_name": "Milk",
                "locations": [
                    {
                        "shelf": shelves[0],
                        "shelf_name": "s1",
                        "location": access,
                        "modular_location": 1,
                    }
                ],
            }
        }
        entries, unreach = solve_tour(ctx, upc_to_data, ["U1"], (0, 0))
        self.assertEqual(unreach, [])
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["upc"], "U1")

    def test_same_shelf_collation(self):
        store = _tiny_store()
        shelves = [
            {
                "_id": "a",
                "shelf_name": "s1",
                "template": "standard_shelf",
                "placement_x": 5,
                "placement_y": 5,
                "rotation": 0,
                "department": "dairy",
            }
        ]
        gb = GraphBuilder(db=None)
        grid, nodes = gb.build_walkability(store, shelves)
        ctx = self._ctx(grid, nodes)
        access = tuple(nodes[0]["primary_access"])
        base_loc = {
            "shelf": shelves[0],
            "shelf_name": "s1",
            "location": access,
        }
        upc_to_data = {
            "U1": {
                "item_name": "A",
                "locations": [{**base_loc, "modular_location": 2}],
            },
            "U2": {
                "item_name": "B",
                "locations": [{**base_loc, "modular_location": 1}],
            },
            "U3": {
                "item_name": "C",
                "locations": [{**base_loc, "modular_location": 3}],
            },
        }
        entries, _ = solve_tour(ctx, upc_to_data, ["U1", "U2", "U3"], (0, 0))
        self.assertEqual(len(entries), 3)
        locs = [tuple(e["location"]) for e in entries]
        self.assertEqual(len(set(locs)), 1)
        charged = [e["distance_from_previous"] for e in entries]
        self.assertEqual(sum(1 for d in charged if d > 0), 1)
        self.assertEqual(entries[0]["upc"], "U2")
        self.assertTrue(entries[1].get("same_shelf_batch"))
        self.assertTrue(entries[2].get("same_shelf_batch"))

    def test_cluster_map(self):
        groups, _ = build_candidates(
            ["U1", "U2"],
            {
                "U1": {
                    "item_name": "A",
                    "locations": [
                        {
                            "shelf_name": "s1",
                            "location": (10, 12),
                            "shelf": {},
                        }
                    ],
                },
                "U2": {
                    "item_name": "B",
                    "locations": [
                        {
                            "shelf_name": "s1",
                            "location": (10, 12),
                            "shelf": {},
                        }
                    ],
                },
            },
            {
                "s1": {
                    "shelf_name": "s1",
                    "accessible": True,
                    "primary_access": [10, 12],
                }
            },
        )
        cmap = build_shelf_cluster_map(groups)
        self.assertTrue(any(len(v) == 2 for v in cmap.values()))


def _open_grid(width=40, height=10):
    walkable = np.ones((height, width), dtype=np.bool_)
    return WalkabilityGrid(width, height, walkable)


def _tour_stop(upc, shelf, xy):
    return TourStop(
        upc=upc,
        shelf_name=shelf,
        access_point=xy,
        loc_data={"modular_location": 1, "shelf": {}},
        item_name=upc,
    )


class TestOrOptLongestLegs(unittest.TestCase):
    @patch("gtsp_solver.OROPT_ENABLED", True)
    def test_relocates_stop_off_long_hop(self):
        grid = _open_grid()
        start = (0, 0)
        a, b, c, d = (2, 0), (4, 0), (25, 0), (6, 0)
        stops = [
            _tour_stop("A", "sa", a),
            _tour_stop("B", "sb", b),
            _tour_stop("C", "sc", c),
            _tour_stop("D", "sd", d),
        ]
        old = _total_tour_dist(stops, start, None, None, {}, grid)
        improved = or_opt_longest_legs(stops, start, None, None, {}, grid)
        new = _total_tour_dist(improved, start, None, None, {}, grid)
        self.assertLess(new, old)
        order = [s.upc for s in improved]
        self.assertEqual(order, ["A", "B", "D", "C"])

    @patch("gtsp_solver.OROPT_ENABLED", True)
    def test_same_shelf_batch_stays_together(self):
        grid = _open_grid()
        start = (0, 0)
        a, b, c, d = (2, 0), (4, 0), (25, 0), (6, 0)
        stops = [
            _tour_stop("A", "sa", a),
            _tour_stop("B", "sb", b),
            _tour_stop("C", "sc", c),
            _tour_stop("D1", "sd", d),
            _tour_stop("D2", "sd", d),
        ]
        improved = or_opt_longest_legs(stops, start, None, None, {}, grid)
        order = [s.upc for s in improved]
        self.assertEqual(order, ["A", "B", "D1", "D2", "C"])
        d_pos = [i for i, s in enumerate(improved) if s.access_point == d]
        self.assertEqual(d_pos, [2, 3])

    @patch("gtsp_solver.OROPT_ENABLED", True)
    def test_accepts_only_if_tour_shortens(self):
        grid = _open_grid()
        start = (0, 0)
        stops = [
            _tour_stop("A", "sa", (2, 0)),
            _tour_stop("B", "sb", (4, 0)),
            _tour_stop("D", "sd", (6, 0)),
            _tour_stop("C", "sc", (25, 0)),
        ]
        old = _total_tour_dist(stops, start, None, None, {}, grid)
        out = or_opt_longest_legs(stops, start, None, None, {}, grid)
        self.assertEqual([s.upc for s in out], ["A", "B", "D", "C"])
        self.assertEqual(_total_tour_dist(out, start, None, None, {}, grid), old)

    @patch("gtsp_solver.OROPT_ENABLED", False)
    def test_disabled_is_noop(self):
        grid = _open_grid()
        start = (0, 0)
        stops = [
            _tour_stop("A", "sa", (2, 0)),
            _tour_stop("B", "sb", (4, 0)),
            _tour_stop("C", "sc", (25, 0)),
            _tour_stop("D", "sd", (6, 0)),
        ]
        out = or_opt_longest_legs(stops, start, None, None, {}, grid)
        self.assertEqual([s.upc for s in out], ["A", "B", "C", "D"])
        self.assertIs(out, stops)

    @patch("pathfinder_config.OROPT_ENABLED", True)
    def test_should_run_or_opt_skips_exact_dp_k(self):
        self.assertFalse(should_run_or_opt(GTSP_EXACT_MAX_K))
        self.assertTrue(should_run_or_opt(GTSP_EXACT_MAX_K + 1))

    @patch("pathfinder_config.OROPT_ENABLED", False)
    def test_should_run_or_opt_respects_disable(self):
        self.assertFalse(should_run_or_opt(GTSP_EXACT_MAX_K + 1))


class _FakeColl:
    def __init__(self):
        self.docs = []
        self.find_calls = 0

    def _matches(self, query):
        query = query or {}
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                yield doc

    def find(self, query=None, projection=None):
        self.find_calls += 1
        return list(self._matches(query))

    def find_one(self, query=None, projection=None):
        return next(self._matches(query), None)

    def update_one(self, filt, update, upsert=False):
        found = self.find_one(filt)
        payload = dict(update.get("$set") or {})
        unset = update.get("$unset") or {}
        if found is not None:
            found.update(payload)
            for key in unset:
                found.pop(key, None)
            return
        if upsert:
            doc = dict(filt)
            doc.update(payload)
            self.docs.append(doc)


class _FakeDb:
    def __init__(self):
        self.stores = _FakeColl()
        self.shelves = _FakeColl()
        self.store_graphs = _FakeColl()


def _layout_store(updated_at):
    store = _tiny_store()
    store["store_number"] = 99
    store["updatedAt"] = updated_at
    return store


def _layout_shelf():
    return {
        "store_number": 99,
        "shelf_name": "s1",
        "template": "standard_shelf",
        "placement_x": 5,
        "placement_y": 5,
        "rotation": 0,
    }


class TestTimestampsEqual(unittest.TestCase):
    def test_none_never_equals(self):
        now = datetime(2026, 8, 31, 12, 0, 0)
        self.assertFalse(timestamps_equal(None, now))
        self.assertFalse(timestamps_equal(now, None))
        self.assertFalse(timestamps_equal(None, None))

    def test_aware_matches_naive_utc(self):
        naive = datetime(2026, 8, 31, 12, 0, 0)
        aware = datetime(2026, 8, 31, 12, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(timestamps_equal(naive, aware))


class TestWalkabilityFreshness(unittest.TestCase):
    def test_matching_store_updated_at_skips_shelves_find(self):
        t0 = datetime(2026, 8, 31, 12, 0, 0)
        db = _FakeDb()
        db.stores.docs.append(_layout_store(t0))
        db.shelves.docs.append(_layout_shelf())
        gb = GraphBuilder(db)
        gb.load_or_build_walkability(99)
        self.assertGreater(db.shelves.find_calls, 0)
        graph = db.store_graphs.find_one({"store_number": 99})
        self.assertEqual(graph.get("store_updated_at"), t0)

        db.shelves.find_calls = 0
        gb.load_or_build_walkability(99)
        self.assertEqual(db.shelves.find_calls, 0)

    def test_missing_store_updated_at_rebuilds(self):
        t0 = datetime(2026, 8, 31, 12, 0, 0)
        db = _FakeDb()
        db.stores.docs.append(_layout_store(t0))
        db.shelves.docs.append(_layout_shelf())
        gb = GraphBuilder(db)
        gb.load_or_build_walkability(99)
        graph = db.store_graphs.find_one({"store_number": 99})
        graph.pop("store_updated_at", None)
        db.shelves.find_calls = 0
        gb.load_or_build_walkability(99)
        self.assertGreater(db.shelves.find_calls, 0)

    def test_cache_hit_skips_shelves_find(self):
        t0 = datetime(2026, 8, 31, 12, 0, 0)
        db = _FakeDb()
        db.stores.docs.append(_layout_store(t0))
        db.shelves.docs.append(_layout_shelf())
        cache = StoreCache(GraphBuilder(db))
        cache.get_context(99)
        db.shelves.find_calls = 0
        cache.get_context(99)
        self.assertEqual(db.shelves.find_calls, 0)
        self.assertEqual(cache._stats["hits"], 1)

    def test_cache_misses_when_updated_at_changes(self):
        t0 = datetime(2026, 8, 31, 12, 0, 0)
        t1 = datetime(2026, 8, 31, 13, 0, 0)
        db = _FakeDb()
        db.stores.docs.append(_layout_store(t0))
        db.shelves.docs.append(_layout_shelf())
        cache = StoreCache(GraphBuilder(db))
        cache.get_context(99)
        db.stores.docs[0]["updatedAt"] = t1
        db.shelves.find_calls = 0
        cache.get_context(99)
        self.assertGreater(db.shelves.find_calls, 0)
        self.assertEqual(cache._stats["misses"], 2)


if __name__ == "__main__":
    unittest.main()
