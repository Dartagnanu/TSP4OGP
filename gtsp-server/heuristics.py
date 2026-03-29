import networkx as nx
from collections import deque
from networkx.readwrite import json_graph


class Heuristics:
    """
    Picking path heuristics for store pathfinding.
    Provides modular strategies for finding optimal pick sequences.
    """
    
    def __init__(self, db, graph_builder):
        self.db = db
        self.graph_builder = graph_builder
    
    def find_pick_path_bfs(self, store_number, upcs, start_point):
        """
        Find picking path using BFS (Breadth-First Search) heuristic.
        
        Starts from start_point and greedily visits nearest unvisited item locations
        in order of distance via BFS.
        
        Args:
            store_number (int): Store identifier
            upcs (list): List of UPC codes to pick
            start_point (tuple): Starting location (x, y)
        
        Returns:
            list: Ordered picks formatted as:
                [
                    {'upc': '0020001000011', 'item_name': 'Item A', 'shelf': 'A21', 'location': (15, 20)},
                    {'upc': '0010001000001', 'item_name': 'Item B', 'shelf': 'A20', 'location': (20, 15)},
                    ...
                ]
            
            Failed/unreachable items are included with 'unreachable': True flag.
        """
        # 1. Fetch store and build/get graph
        store = self.db.stores.find_one({'store_number': store_number})
        if not store:
            raise ValueError(f"Store {store_number} not found")
        
        nx_graph = self.graph_builder.prompt_for_graph(store_number)
        if isinstance(nx_graph, dict):
            nx_graph = json_graph.node_link_graph(nx_graph)
        
        # 2. Map UPCs to item data and shelf locations
        upc_to_data = self._fetch_upc_locations(upcs)
        
        # 3. BFS from start point to find nearest items in order
        pick_list = self._bfs_pick_sequence(nx_graph, start_point, upc_to_data, upcs)
        
        return pick_list
    
    def _fetch_upc_locations(self, upcs):
        """
        Fetch item and shelf location data for all UPCs.
        
        Returns:
            dict: {upc: {'item_name': str, 'locations': [{'shelf': {...}, 'location': (x,y)}, ...]}}
        """
        upc_to_data = {}
        
        for upc in upcs:
            # Find item index for this UPC
            item_index = self.db.itemindexes.find_one({'upcs': {'$in': [upc]}})
            if not item_index:
                upc_to_data[upc] = {'item_name': 'Unknown', 'locations': []}
                continue
            
            item_name = item_index.get('name', 'Unknown')
            locations = []
            
            # Fetch shelf data for each location
            for loc in item_index.get('locations', []):
                shelf_object_id = loc['shelf_name']
                shelf_data = self.db.shelves.find_one({'_id': shelf_object_id})
                
                if shelf_data:
                    locations.append({
                        'shelf': shelf_data,
                        'shelf_name': shelf_data.get('shelf_name', str(shelf_data['_id'])),
                        'location': (shelf_data['placement_x'], shelf_data['placement_y']),
                        'modular_location': loc.get('location', None)
                    })
            
            upc_to_data[upc] = {
                'item_name': item_name,
                'locations': locations
            }
        
        return upc_to_data
    
    def _bfs_distance(self, graph, start, end):
        """
        Compute shortest path distance using BFS.
        Returns: distance (int), or float('inf') if no path exists.
        """
        try:
            return nx.shortest_path_length(graph, start, end)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return float('inf')
    
    def _bfs_pick_sequence(self, graph, start_point, upc_to_data, upcs):
        """
        Greedy nearest-neighbor picking using BFS distances.
        
        From current location, always pick the closest unvisited item.
        """
        pick_list = []
        visited_upcs = set()
        current_location = start_point
        
        unreachable_items = []
        for _ in range(len(upcs)):
            closest_upc = None
            closest_distance = float('inf')
            closest_shelf = None
            closest_location = None
            
            # Search for nearest unvisited item
            for upc in upcs:
                if upc in visited_upcs:
                    continue

                locations = upc_to_data[upc]['locations']

                # If no locations, collect unreachable item now and skip
                if not locations:
                    if upc not in unreachable_items:
                        unreachable_items.append(upc)
                    continue

                # Find closest shelf location for this item
                for loc_data in locations:
                    shelf_location = loc_data['location']
                    distance = self._bfs_distance(graph, current_location, shelf_location)

                    if distance < closest_distance:
                        closest_distance = distance
                        closest_upc = upc
                        closest_shelf = loc_data
                        closest_location = shelf_location

            # Add the closest item to pick list
            if closest_upc:
                # Build JSON-safe shelf payload
                shelf_data = closest_shelf.get('shelf', {})
                shelf_json = {
                    'shelf_name': closest_shelf.get('shelf_name'),
                    'placement_x': shelf_data.get('placement_x'),
                    'placement_y': shelf_data.get('placement_y'),
                    'template': shelf_data.get('template'),
                    'department': shelf_data.get('department'),
                    'modulars': shelf_data.get('modulars'),
                }

                pick_list.append({
                    'upc': closest_upc,
                    'item_name': upc_to_data[closest_upc]['item_name'],
                    'shelf': closest_shelf['shelf_name'],
                    'shelf_data': shelf_json,
                    'modular_location': closest_shelf.get('modular_location'),
                    'location': closest_location,
                    'distance_from_previous': closest_distance
                })
                visited_upcs.add(closest_upc)
                current_location = closest_location
            else:
                # No more reachable items; add remaining as unreachable
                for upc in upcs:
                    if upc not in visited_upcs and upc not in unreachable_items:
                        unreachable_items.append(upc)
                break

        # append unreachable items at end with shelf='unknown'
        for upc in unreachable_items:
            if upc in visited_upcs:
                continue
            pick_list.append({
                'upc': upc,
                'item_name': upc_to_data[upc]['item_name'],
                'shelf': 'unknown',
                'shelf_data': None,
                'modular_location': None,
                'location': None,
                'unreachable': True
            })
            visited_upcs.add(upc)

        return pick_list
        
        return pick_list
