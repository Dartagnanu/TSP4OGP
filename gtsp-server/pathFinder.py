import networkx as nx
from networkx.readwrite import json_graph

class Pathfinder:
    def __init__(self, db, graph_builder):
        self.db = db
        self.graph_builder = graph_builder

    def find_path(self, store_number, upcs):
        store = self.db.stores.find_one({'store_number': store_number})
        print(store)
        # Use the first starting point, or handle empty list
        if store.get('starting_points'):
            start = tuple(store['starting_points'][0]['point'])
            end = tuple(store['starting_points'][0]['point'])  # assuming round trip
        else:
            raise ValueError("No starting_points defined for store")
        return self.find_path_with_endpoints(store_number, upcs, start, end)
    
    def find_path_with_endpoints(self, store_number, upcs, start, end):
        # 1. Get the graph for the store
        graph = self.graph_builder.prompt_for_graph(store_number)
        # If graph is a dict, convert to NetworkX graph
        if isinstance(graph, dict):
            graph = json_graph.node_link_graph(graph)

        # 2. Fetch all item indexes for the UPCs
        upc_to_item_index = {}
        for upc in upcs:
            item_index = self.db.item_indexes.find_one({'upc': upc})
            if item_index:
                upc_to_item_index[upc] = item_index

        # 3. For each item, get all shelf locations
        upc_to_shelves = {}
        for upc, item_index in upc_to_item_index.items():
            locations = []
            for loc in item_index.get('locations', []):
                shelf_data = self.db.shelves.find_one({'_id': loc['shelf_name']})
                if shelf_data:
                    # Save all required info as a dict
                    locations.append({
                        'shelf_name': shelf_data['shelf_name'],
                        'location': loc['location'],  # position in modular on shelf
                        'placement_x': shelf_data['placement_x'],
                        'placement_y': shelf_data['placement_y']
                    })
            if locations:
                upc_to_shelves[upc] = locations

        # 4. For each UPC, pick the shelf location closest to the previous node in the path (greedy, not true GTSP)
        # For true GTSP, use a solver. We pick the first location for each UPC for simplicity for now.
        tsp_nodes = [start]
        upc_location_map = {}
        current = start
        unreachable_upcs = []
        for upc in upcs:
            locations = upc_to_shelves.get(upc, [])
            if not locations:
                unreachable_upcs.append(upc)
                continue
            try:
                # Pick the closest shelf to the current node
                closest = min(
                    locations,
                    key=lambda loc: nx.shortest_path_length(graph, current, (loc['placement_x'], loc['placement_y']))
                )
                node = (closest['placement_x'], closest['placement_y'])
                tsp_nodes.append(node)
                upc_location_map[upc] = {**closest, 'node': node}
                current = node
            except nx.NetworkXNoPath:
                unreachable_upcs.append(upc)
        tsp_nodes.append(end)

        # 5. Find shortest path visiting all nodes (simple TSP)
        try:
            path = nx.approximation.traveling_salesman_problem(graph, nodes=tsp_nodes, cycle=False)
        except nx.NetworkXNoPath:
            path = tsp_nodes  # fallback: just the requested nodes in order

        # 6. Map UPCs to their locations in the path
        result = []
        for node in path:
            upc = None
            shelf_info = None
            for k, v in upc_location_map.items():
                if node == v['node']:
                    upc = k
                    shelf_info = v
                    break
            result.append({'location': node, 'upc': upc, 'shelf': shelf_info})

        # Add unreachable UPCs at the end
        for upc in unreachable_upcs:
            result.append({'location': None, 'upc': upc, 'shelf': None, 'unreachable': True})

        return result



