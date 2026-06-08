#!/usr/bin/env python3
"""Unit tests for GTSP pathfinding (no Mongo)."""
import unittest

import numpy as np

from graphBuilder import GraphBuilder
from gtsp_solver import (
    build_candidates,
    build_shelf_cluster_map,
    solve_tour,
)
from polygon_grid import get_covered_cells, point_in_polygon
from shelf_access import resolve_access_points
from store_cache import StoreContext
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


if __name__ == "__main__":
    unittest.main()
