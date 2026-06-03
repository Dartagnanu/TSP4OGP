import networkx as nx
import math
from datetime import datetime
from networkx.readwrite import json_graph


class GraphBuilder:
    def __init__(self, db):
        self.graphList = {}  # store_number -> graph
        self.db = db

    def rotate(self, x, y, angle):
        rad = math.radians(angle)
        return (
            x * math.cos(rad) - y * math.sin(rad),
            x * math.sin(rad) + y * math.cos(rad)
        )

    def build_graph(self, store, shelves):
        width = store['map_size']['width']
        height = store['map_size']['height']
        G = nx.grid_2d_graph(width, height)
        obstacles = set()
        shelf_access_points = set()

        for shelf in shelves:
            template = store['shelf_templates'][shelf['template']]
            shape = template['shape']
            rotation = shelf.get('rotation', 0)
            placement_x = shelf['placement_x']
            placement_y = shelf['placement_y']

            # Keep placement point itself as an access node
            shelf_access_points.add((placement_x, placement_y))

            rotated_shape = [self.rotate(x, y, rotation) for x, y in shape]
            translated_shape = [
                (int(round(placement_x + x)), int(round(placement_y + y)))
                for x, y in rotated_shape
            ]

            # Mark all shelf cells as obstacles
            for x, y in translated_shape:
                if 0 <= x < width and 0 <= y < height:
                    obstacles.add((x, y))

        # Remove obstacle nodes but keep shelf access points (so pick path can reach shelves)
        nodes_to_remove = obstacles - shelf_access_points
        G.remove_nodes_from(nodes_to_remove)
        return G

    def prompt_for_graph(self, store_number):
        # 1. Check in-memory cache
        if store_number in self.graphList:
            return self.graphList[store_number]

        # 2. Check database
        graph_doc = self.db.store_graphs.find_one({'store_number': store_number})
        if graph_doc:
            #deserialize the graph
            graph = json_graph.node_link_graph(graph_doc['graph'])
            # Check if graph is stale compared to store/shelves
            store = self.db.stores.find_one({'store_number': store_number})
            if not store:
                raise ValueError("Store not found")
            graph_last_updated = graph_doc.get('last_updated')
            store_last_updated = store.get('updatedAt')
            # If the graph is fresher than the store, use it
            if graph_doc and graph_last_updated and store_last_updated and graph_last_updated > store_last_updated:
                return graph_doc['graph']

        # 3. Build new graph and cache it
        store = self.db.stores.find_one({'store_number': store_number})
        shelves = list(self.db.shelves.find({'store_number': store_number}))
        graph = self.build_graph(store, shelves)
        # Cache in memory and store in database
        self.graphList[store['store_number']] = graph
        # Serialize the graph for storage
        serialized_graph = json_graph.node_link_data(graph)
        self.db.store_graphs.update_one(
            {'store_number': store_number},
            {'$set': {'graph': serialized_graph, 'last_updated': datetime.utcnow()}},
            upsert=True
        )
        return graph
