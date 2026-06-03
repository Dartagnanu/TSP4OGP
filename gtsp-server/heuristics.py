import networkx as nx
from collections import deque
from networkx.readwrite import json_graph
import numpy as np
try:
    import cudf  # type: ignore
    import cugraph  # type: ignore
    import cupy as cp  # type: ignore
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False


class Heuristics:
    """
    Picking path heuristics for store pathfinding.
    Provides modular strategies for finding optimal pick sequences.
    """
    
    def __init__(self, db, graph_builder, gpu_available=None):
        self.db = db
        self.graph_builder = graph_builder
        if gpu_available is None:
            gpu_available = GPU_AVAILABLE
        self.gpu_available = bool(gpu_available) and GPU_AVAILABLE
        
        if not self.gpu_available:
            print("WARNING: GPU acceleration not available - using slower CPU-based heuristics")
        
        # Cache for converted graphs
        self._cugraph_cache = {}
    
    def _get_cugraph(self, store_number, nx_graph):
        """Get or create cuGraph version of NetworkX graph (or NetworkX if GPU unavailable)"""
        if store_number not in self._cugraph_cache:
            if self.gpu_available:
                print(f"Converting NetworkX graph to cuGraph for store {store_number}...")
                cugraph_graph, _ = self._networkx_to_cugraph(nx_graph)
                print(f"Graph conversion complete - {len(nx_graph.nodes)} nodes, {len(nx_graph.edges)} edges")
                self._cugraph_cache[store_number] = cugraph_graph
            else:
                print(f"Caching NetworkX graph for store {store_number} (CPU mode)...")
                self._cugraph_cache[store_number] = nx_graph
                print(f"Graph cached - {len(nx_graph.nodes)} nodes, {len(nx_graph.edges)} edges")
        
        return self._cugraph_cache[store_number]
    
    def _networkx_to_cugraph(self, nx_graph):
        """Convert NetworkX graph to cuGraph format"""
        # Get edge list from NetworkX graph
        edges = list(nx_graph.edges(data=True))
        
        # Create edge list with weights (default to 1 if no weight)
        edge_data = []
        for u, v, data in edges:
            weight = data.get('weight', 1.0)
            # Convert tuple coordinates to node IDs
            u_id = self._coord_to_node_id(u)
            v_id = self._coord_to_node_id(v)
            edge_data.append([u_id, v_id, weight])
        
        # Create cuDF DataFrame
        if edge_data:
            df = cudf.DataFrame(edge_data, columns=['src', 'dst', 'weight'])
        else:
            df = cudf.DataFrame(columns=['src', 'dst', 'weight'])
        
        # Create cuGraph
        G = cugraph.Graph()
        if len(df) > 0:
            G.from_cudf_edgelist(df, source='src', destination='dst', edge_attr='weight')
        
        return G, df
    
    def _coord_to_node_id(self, coord):
        """Convert (x, y) coordinate to unique node ID"""
        return coord[0] * 10000 + coord[1]
    
    def _gpu_distance(self, graph, start_coord, end_coord):
        """Compute shortest path distance (GPU-accelerated if available, CPU fallback if not)"""
        if self.gpu_available:
            return self._gpu_distance_cuda(graph, start_coord, end_coord)
        else:
            return self._cpu_distance(graph, start_coord, end_coord)
    
    def _gpu_distance_cuda(self, cugraph_graph, start_coord, end_coord):
        """Compute shortest path distance using GPU"""
        try:
            start_id = self._coord_to_node_id(start_coord)
            end_id = self._coord_to_node_id(end_coord)
            
            # Use cuGraph's SSSP algorithm
            distances = cugraph.sssp(cugraph_graph, start_id)
            
            # Get distance to target
            target_row = distances[distances['vertex'] == end_id]
            if len(target_row) == 0:
                return float('inf')
            
            return target_row['distance'].iloc[0]
        except Exception as e:
            print(f"GPU distance calculation failed: {e}")
            return float('inf')
    
    def _cpu_distance(self, nx_graph, start_coord, end_coord):
        """Compute shortest path distance using NetworkX (CPU)"""
        try:
            # Try to find shortest path using Dijkstra's algorithm
            path_length = nx.shortest_path_length(nx_graph, start_coord, end_coord, weight='weight')
            return path_length
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return float('inf')
        except Exception as e:
            print(f"CPU distance calculation failed: {e}")
            return float('inf')
    
    def find_pick_path_bfs(self, store_number, upcs, start_point):
        """
        Find picking path using GPU-accelerated BFS heuristic.
        
        Starts from start_point and greedily visits nearest unvisited item locations
        using GPU-accelerated shortest path calculations.
        
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
        
        # Get GPU-accelerated graph
        cugraph_graph = self._get_cugraph(store_number, nx_graph)
        
        # 2. Map UPCs to item data and shelf locations
        upc_to_data = self._fetch_upc_locations(upcs)
        
        # 3. GPU-accelerated BFS from start point to find nearest items in order
        pick_list = self._gpu_pick_sequence(cugraph_graph, start_point, upc_to_data, upcs)
        
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
    
    def _gpu_pick_sequence(self, cugraph_graph, start_point, upc_to_data, upcs):
        """
        Greedy nearest-neighbor picking using GPU-accelerated distance calculations.
        
        From current location, always pick the closest unvisited item using GPU SSSP.
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
            
            # Search for nearest unvisited item using GPU acceleration
            for upc in upcs:
                if upc in visited_upcs:
                    continue

                locations = upc_to_data[upc]['locations']

                # If no locations, collect unreachable item now and skip
                if not locations:
                    if upc not in unreachable_items:
                        unreachable_items.append(upc)
                    continue

                # Find closest shelf location for this item using GPU distance
                for loc_data in locations:
                    shelf_location = loc_data['location']
                    distance = self._gpu_distance(cugraph_graph, current_location, shelf_location)

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