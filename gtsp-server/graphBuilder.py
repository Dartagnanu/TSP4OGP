import hashlib
import json
import math
from datetime import datetime
from typing import List, Tuple

import numpy as np
from bson import Binary
from networkx.readwrite import json_graph

from pathfinder_config import MAX_MAP_HEIGHT, MAX_MAP_WIDTH, WALKABILITY_FORMAT
from polygon_grid import get_covered_cells, rotate_point, translated_rotated_shape
from shelf_access import build_shelf_node
from walkability import WalkabilityGrid


class GraphBuilder:
    def __init__(self, db, on_graph_rebuild=None):
        self.db = db
        self.on_graph_rebuild = on_graph_rebuild

    def rotate(self, x, y, angle):
        return rotate_point(x, y, angle)

    def shelves_hash_for_store(self, store_number: int) -> str:
        shelves = list(self.db.shelves.find({"store_number": store_number}))
        return self.compute_shelves_hash(shelves)

    @staticmethod
    def compute_shelves_hash(shelves: list) -> str:
        parts = []
        for s in sorted(shelves, key=lambda x: str(x.get("shelf_name", x.get("_id", "")))):
            parts.append(
                f"{s.get('placement_x')}:{s.get('placement_y')}:"
                f"{s.get('template')}:{s.get('rotation', 0)}"
            )
        return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]

    def build_walkability(self, store: dict, shelves: list) -> Tuple[WalkabilityGrid, list]:
        width = int(store["map_size"]["width"])
        height = int(store["map_size"]["height"])
        if width > MAX_MAP_WIDTH or height > MAX_MAP_HEIGHT:
            raise ValueError(
                f"Map {width}x{height} exceeds limits {MAX_MAP_WIDTH}x{MAX_MAP_HEIGHT}"
            )

        walkable = np.ones((height, width), dtype=np.bool_)
        shelf_nodes = []

        templates = store.get("shelf_templates") or {}
        if hasattr(templates, "items"):
            templates = dict(templates)

        for shelf in shelves:
            template_name = shelf["template"]
            template = templates.get(template_name)
            if not template:
                continue
            shape = template["shape"]
            rotation = shelf.get("rotation", 0)
            placement_x = int(shelf["placement_x"])
            placement_y = int(shelf["placement_y"])

            world_poly = translated_rotated_shape(shape, placement_x, placement_y, rotation)
            for wx, wy in get_covered_cells(world_poly):
                tx, ty = int(round(wx)), int(round(wy))
                if 0 <= tx < width and 0 <= ty < height:
                    walkable[ty, tx] = False

        grid = WalkabilityGrid(width, height, walkable)

        for shelf in shelves:
            template_name = shelf["template"]
            template = templates.get(template_name)
            if not template:
                continue
            node = build_shelf_node(shelf, template, grid)
            shelf_nodes.append(node)

        return grid, shelf_nodes

    def _legacy_graph_to_walkability(self, graph_doc: dict) -> Tuple[WalkabilityGrid, list]:
        """Convert stored node_link graph to walkability (migration path)."""
        g = json_graph.node_link_graph(graph_doc["graph"])
        nodes = list(g.nodes())
        if not nodes:
            raise ValueError("Empty legacy graph")
        xs = [int(n[0]) for n in nodes]
        ys = [int(n[1]) for n in nodes]
        width = max(xs) + 1
        height = max(ys) + 1
        walkable = np.zeros((height, width), dtype=np.bool_)
        for x, y in nodes:
            if 0 <= x < width and 0 <= y < height:
                walkable[y, x] = True
        shelf_nodes = graph_doc.get("shelf_nodes") or []
        return WalkabilityGrid(width, height, walkable), shelf_nodes

    def load_or_build_walkability(self, store_number: int) -> Tuple[WalkabilityGrid, list, str]:
        store = self.db.stores.find_one({"store_number": store_number})
        if not store:
            raise ValueError(f"Store {store_number} not found")

        shelves = list(self.db.shelves.find({"store_number": store_number}))
        shelves_hash = self.compute_shelves_hash(shelves)
        store_updated = store.get("updatedAt")

        graph_doc = self.db.store_graphs.find_one({"store_number": store_number})

        if graph_doc and graph_doc.get("format") == WALKABILITY_FORMAT:
            doc_hash = graph_doc.get("shelves_hash")
            graph_last = graph_doc.get("last_updated")
            fresh = doc_hash == shelves_hash
            if store_updated and graph_last:
                fresh = fresh and graph_last >= store_updated
            if fresh:
                w = int(graph_doc["width"])
                h = int(graph_doc["height"])
                data = graph_doc["walkable"]
                if isinstance(data, Binary):
                    data = bytes(data)
                walkable = WalkabilityGrid.unpack_bits(data, w, h)
                grid = WalkabilityGrid(w, h, walkable)
                return grid, graph_doc.get("shelf_nodes", []), shelves_hash

        if self.on_graph_rebuild:
            self.on_graph_rebuild(store_number)

        grid, shelf_nodes = self.build_walkability(store, shelves)
        self._persist_walkability(store_number, grid, shelf_nodes, shelves_hash)
        return grid, shelf_nodes, shelves_hash

    def _persist_walkability(
        self,
        store_number: int,
        grid: WalkabilityGrid,
        shelf_nodes: list,
        shelves_hash: str,
    ) -> None:
        packed = Binary(WalkabilityGrid.pack_bits(grid.walkable))
        self.db.store_graphs.update_one(
            {"store_number": store_number},
            {
                "$set": {
                    "format": WALKABILITY_FORMAT,
                    "width": grid.width,
                    "height": grid.height,
                    "walkable": packed,
                    "shelf_nodes": shelf_nodes,
                    "shelves_hash": shelves_hash,
                    "last_updated": datetime.utcnow(),
                },
                "$unset": {"graph": ""},
            },
            upsert=True,
        )

    def export_graph_json(self, store_number: int, max_nodes: int = 50000) -> dict:
        """API export for /graph — compact summary or node_link if small enough."""
        grid, shelf_nodes, shelves_hash = self.load_or_build_walkability(store_number)
        if grid.walkable_count <= max_nodes:
            import networkx as nx

            g = nx.Graph()
            ys, xs = np.where(grid.walkable)
            for x, y in zip(xs.tolist(), ys.tolist()):
                g.add_node((x, y))
            for x, y in zip(xs.tolist(), ys.tolist()):
                for nx_, ny in ((x + 1, y), (x, y + 1)):
                    if grid.is_walkable(nx_, ny):
                        g.add_edge((x, y), (nx_, ny))
            data = json_graph.node_link_data(g)
            data["format"] = "node_link_export"
            data["shelf_nodes"] = shelf_nodes
            return data
        return {
            "format": "walkability_summary",
            "width": grid.width,
            "height": grid.height,
            "walkable_count": grid.walkable_count,
            "shelves_hash": shelves_hash,
            "shelf_nodes": shelf_nodes,
            "message": "Graph too large for full node_link export",
        }

    def prompt_for_graph(self, store_number: int):
        grid, shelf_nodes, _ = self.load_or_build_walkability(store_number)
        return self.export_graph_json(store_number)
