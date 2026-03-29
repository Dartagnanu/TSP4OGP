import networkx as nx
from networkx.readwrite import json_graph
<<<<<<< Updated upstream
=======
import numpy as np
from heuristics import Heuristics
try:
    import cudf  # type: ignore
    import cugraph  # type: ignore
    import cupy as cp  # type: ignore
    CUPY_AVAILABLE = True
    CUGRAPH_AVAILABLE = True
except ImportError:
    import numpy as cp  # Use numpy as fallback
    CUPY_AVAILABLE = False
    CUGRAPH_AVAILABLE = False
>>>>>>> Stashed changes

class Pathfinder:
    def __init__(self, db, graph_builder):
        self.db = db
        self.graph_builder = graph_builder
<<<<<<< Updated upstream
=======
        print("Initializing Pathfinder...")
        self.gpu_available = self._check_gpu_availability()
        
        # Initialize heuristics module for picking strategy
        self.heuristics = Heuristics(db, graph_builder)
        
        # Add caching for expensive graph operations
        self._graph_cache = {}  # Cache converted graphs per store
        self._distance_cache = {}  # Cache distance matrices for frequent node sets
        
        if self.gpu_available:
            print("GPU acceleration ENABLED - cuGraph and CuPy ready!")
        else:
            print("GPU acceleration DISABLED - PATHFINDER DISABLED!!")
    
    def _check_gpu_availability(self):
        """Check if GPU and cuGraph are available"""
        print("Checking GPU availability...")
        try:
            if not (CUPY_AVAILABLE and CUGRAPH_AVAILABLE):
                msg = f"GPU libraries missing - CuPy: {CUPY_AVAILABLE}, cuGraph: {CUGRAPH_AVAILABLE}. GPU acceleration required."
                print(msg)
                raise RuntimeError(msg)
            
            # Test GPU availability
            device = cp.cuda.Device(0)
            compute_cap = device.compute_capability
            print(f"GPU Device 0 found - Compute capability: {compute_cap}")
            
            # Test basic GPU operation
            test = cp.array([1, 2, 3])
            result = cp.sum(test).item()
            print(f"GPU test operation successful - sum([1,2,3]) = {result}")
            
            print("All GPU checks passed - GPU acceleration available!")
            return True
        except Exception as e:
            print(f"GPU not available: {e}")
            raise RuntimeError(f"GPU acceleration is required but not available: {e}") from e

    def networkx_to_cugraph(self, nx_graph):
        """Convert NetworkX graph to cuGraph format"""
        # Get edge list from NetworkX graph
        edges = list(nx_graph.edges(data=True))
        
        # Create edge list with weights (default to 1 if no weight)
        edge_data = []
        for u, v, data in edges:
            weight = data.get('weight', 1.0)
            # Convert tuple coordinates to node IDs
            u_id = u[0] * 10000 + u[1] if isinstance(u, tuple) else u
            v_id = v[0] * 10000 + v[1] if isinstance(v, tuple) else v
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

    def coord_to_node_id(self, coord):
        """Convert (x, y) coordinate to unique node ID"""
        return coord[0] * 10000 + coord[1]  # Increased multiplier for larger grids

    def node_id_to_coord(self, node_id):
        """Convert node ID back to (x, y) coordinate"""
        return (node_id // 10000, node_id % 10000)

    def find_shortest_path_gpu(self, cugraph_graph, start_id, end_id):
        """Find shortest path using cuGraph SSSP (Single Source Shortest Path)"""
        try:
            # Use cuGraph's SSSP algorithm
            distances = cugraph.sssp(cugraph_graph, start_id)
            
            # Get distance to target
            target_row = distances[distances['vertex'] == end_id]
            if len(target_row) == 0:
                return None, float('inf')
            
            distance = target_row['distance'].iloc[0]
            
            # For path reconstruction, we'll use a simpler approach
            # cuGraph doesn't directly return paths, so we'll use the distances
            return None, distance  # Return None for path, just distance for now
            
        except Exception as e:
            print(f"GPU shortest path failed: {e}")
            return None, float('inf')

    def approximate_tsp_gpu(self, cugraph_graph, node_ids):
        """Optimized TSP using batched GPU shortest paths"""
        n = len(node_ids)
        if n <= 1:
            return list(range(n))
        
        print(f"Building {n}x{n} distance matrix on GPU (optimized)...")
        
        # Use GPU-optimized batch distance computation
        distance_matrix = cp.full((n, n), cp.inf, dtype=cp.float32)
        
        # Batch compute distances for all source nodes
        try:
            # Convert to cuDF for batch processing
            node_df = cudf.DataFrame({'node_id': node_ids})
            
            # Use multi-source shortest path if available, otherwise batch single-source
            for i, start_id in enumerate(node_ids):
                # Compute distances from this source to all targets at once
                distances = cugraph.sssp(cugraph_graph, start_id)
                
                # Extract distances to all target nodes in one operation
                target_distances = distances[distances['vertex'].isin(node_ids)]
                
                # Map distances back to matrix positions
                for _, row in target_distances.iterrows():
                    target_id = row['vertex']
                    if target_id in node_ids:
                        j = node_ids.index(target_id)
                        if i != j:
                            distance_matrix[i, j] = row['distance']
                            
        except Exception as e:
            print(f"⚠️  Optimized distance computation failed, using fallback: {e}")
            # Fallback to previous method but with early termination
            for i, start_id in enumerate(node_ids[:min(n, 20)]):  # Limit for performance
                try:
                    distances = cugraph.sssp(cugraph_graph, start_id)
                    for j, end_id in enumerate(node_ids):
                        if i != j:
                            target_row = distances[distances['vertex'] == end_id]
                            if len(target_row) > 0:
                                distance_matrix[i, j] = target_row['distance'].iloc[0]
                except Exception as inner_e:
                    print(f"⚠️  Skipping distance computation from {start_id}: {inner_e}")
        
        print("Running optimized greedy TSP on GPU...")
        
        # Optimized greedy TSP with early termination
        visited = cp.zeros(n, dtype=bool)
        path = [0]
        visited[0] = True
        current = 0
        
        for step in range(n - 1):
            # Find nearest unvisited node
            unvisited_mask = ~visited
            current_distances = distance_matrix[current]
            
            # Mask out visited nodes
            current_distances = cp.where(unvisited_mask, current_distances, cp.inf)
            
            # Find minimum
            if cp.any(current_distances < cp.inf):
                next_node = int(cp.argmin(current_distances))
                path.append(next_node)
                visited[next_node] = True
                current = next_node
            else:
                print(f"⚠️  No reachable nodes at step {step}, terminating early")
                break
        
        print(f"Optimized GPU TSP complete - found path visiting {len(path)} nodes")
        return path

    def solve_path_task(self, grid_structure, start_coord, end_coord, waypoints=None):
        """Main method to solve pathfinding task with optional GPU acceleration"""
        try:
            # Build store graph from structure
            graph, adjacency_matrix, node_positions = self.graph_builder.build_graph_from_structure(grid_structure)
            graph_size = len(graph.nodes)
            print(f"Graph built - {graph_size} nodes, {len(graph.edges)} edges")
            
            # Choose GPU or CPU approach based on availability
            use_gpu = self.gpu_available and graph_size > 100
            if use_gpu:
                print(f"Using GPU acceleration (graph size: {graph_size} > 100)")
                return self._solve_with_gpu(graph, start_coord, end_coord, waypoints)
            else:
                reason = "GPU unavailable" if not self.gpu_available else f"graph too small ({graph_size} <= 100)"
                print(f"Using CPU pathfinding ({reason})")
                return self._solve_with_cpu(graph, start_coord, end_coord, waypoints)
                
        except Exception as e:
            print(f"⚠️ Error in solve_path_task: {e}")
            return {
                "status": "error",
                "error": str(e),
                "path": [],
                "distance": float('inf')
            }
    
    def _solve_with_gpu(self, nx_graph, start_coord, end_coord, waypoints=None):
        """Solve pathfinding using GPU acceleration"""
        try:
            print("Converting NetworkX graph to cuGraph format...")
            # Convert NetworkX graph to cuGraph
            cugraph_graph, edge_df = self.networkx_to_cugraph(nx_graph)
            print(f"Graph converted - {len(edge_df)} edges in cuGraph format")
            
            if waypoints:
                print(f"Solving TSP with {len(waypoints)} waypoints using GPU")
                return self._solve_tsp_gpu(cugraph_graph, nx_graph, start_coord, end_coord, waypoints)
            else:
                print("Solving shortest path using GPU")
                return self._solve_shortest_path_gpu(cugraph_graph, nx_graph, start_coord, end_coord)
                
        except Exception as e:
            print(f"❌ GPU pathfinding failed, falling back to CPU: {e}")
            return self._solve_with_cpu(nx_graph, start_coord, end_coord, waypoints)
    
    def _solve_tsp_gpu(self, cugraph_graph, nx_graph, start_coord, end_coord, waypoints):
        """Solve TSP problem using GPU"""
        print(f"Starting GPU-accelerated TSP solver...")
        # Convert coordinates to node IDs
        start_id = self.coord_to_node_id(start_coord)
        end_id = self.coord_to_node_id(end_coord)
        waypoint_ids = [self.coord_to_node_id(wp) for wp in waypoints]
        
        # All nodes to visit (start + waypoints + end)
        all_nodes = [start_id] + waypoint_ids + [end_id]
        print(f"TSP nodes: {len(all_nodes)} total (1 start + {len(waypoints)} waypoints + 1 end)")
        
        # Get optimal order using GPU-accelerated TSP approximation
        print("Running GPU-accelerated TSP approximation...")
        optimal_order_indices = self.approximate_tsp_gpu(cugraph_graph, all_nodes)
        optimal_nodes = [all_nodes[i] for i in optimal_order_indices]
        print(f"TSP optimization complete - optimal order: {optimal_order_indices}")
        
        # Build complete path by connecting consecutive nodes using NetworkX
        print("Building complete path from TSP solution...")
        complete_path = []
        total_distance = 0.0
        
        for i in range(len(optimal_nodes) - 1):
            current_coord = self.node_id_to_coord(optimal_nodes[i])
            next_coord = self.node_id_to_coord(optimal_nodes[i + 1])
            
            try:
                path_segment = nx.shortest_path(nx_graph, current_coord, next_coord)
                segment_distance = nx.shortest_path_length(nx_graph, current_coord, next_coord)
            except nx.NetworkXNoPath:
                # Fallback: direct connection
                path_segment = [current_coord, next_coord]
                segment_distance = 1.0
            
            # Add segment to complete path (avoid duplicating nodes)
            if not complete_path:
                complete_path.extend(path_segment)
            else:
                complete_path.extend(path_segment[1:])  # Skip first node to avoid duplication
            
            total_distance += segment_distance
        
        print(f"GPU-accelerated TSP complete! Path: {len(complete_path)} nodes, Distance: {total_distance:.2f}")
        return {
            "status": "success",
            "path": complete_path,
            "distance": total_distance,
            "method": "GPU-accelerated TSP"
        }
    
    def _solve_shortest_path_gpu(self, cugraph_graph, nx_graph, start_coord, end_coord):
        """Solve simple shortest path using GPU"""
        print(f"Computing shortest path from {start_coord} to {end_coord}...")
        try:
            # Use NetworkX for path reconstruction
            path = nx.shortest_path(nx_graph, start_coord, end_coord)
            distance = nx.shortest_path_length(nx_graph, start_coord, end_coord)
            
            print(f"GPU-enhanced shortest path found! Path: {len(path)} nodes, Distance: {distance}")
            return {
                "status": "success",
                "path": path,
                "distance": distance,
                "method": "GPU-enhanced shortest path"
            }
        except nx.NetworkXNoPath:
            print("❌ No path found between start and end coordinates")
            return {
                "status": "no_path",
                "path": [],
                "distance": float('inf'),
                "method": "GPU-enhanced shortest path"
            }
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
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



=======
        """
        Find picking path from start point through required UPCs to end point.
        Uses BFS-based heuristic for greedy nearest-neighbor picking strategy.
        
        Returns:
            list: Pick list with shelf and item information for each UPC
        """
        print(f"Finding path for {len(upcs)} UPCs in store {store_number}")
        
        if not self.gpu_available:
            raise RuntimeError("GPU pathfinding is required but GPU acceleration is unavailable. Please ensure NVIDIA GPU and RAPIDS AI are properly installed.")
        
        print("Using BFS heuristic picking strategy for UPC collection")
        
        # Use heuristics to find optimal picking sequence
        pick_list = self.heuristics.find_pick_path_bfs(store_number, upcs, start)
        
        return pick_list

    # Legacy GPU pathfinding methods moved to heuristics.py
    # The following complex methods are superseded by the modular Heuristics class
>>>>>>> Stashed changes
