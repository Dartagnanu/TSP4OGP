import networkx as nx
import math

def rotate(x, y, angle):
    rad = math.radians(angle)
    return (
        x * math.cos(rad) - y * math.sin(rad),
        x * math.sin(rad) + y * math.cos(rad)
    )

def build_grid(store, shelves):
    width = store['map_size']['width']
    height = store['map_size']['height']
    G = nx.grid_2d_graph(width, height)
    obstacles = set()

    for shelf in shelves:
        template = store['shelf_templates'][shelf['template']]
        shape = template['shape']
        rotation = shelf.get('rotation', 0)
        placement_x = shelf['placement_x']
        placement_y = shelf['placement_y']

        rotated_shape = [rotate(x, y, rotation) for x, y in shape]
        translated_shape = [(int(round(placement_x + x)), int(round(placement_y + y))) for x, y in rotated_shape]

        min_x = min(x for x, y in translated_shape)
        max_x = max(x for x, y in translated_shape)
        min_y = min(y for x, y in translated_shape)
        max_y = max(y for x, y in translated_shape)
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                obstacles.add((x, y))

    G.remove_nodes_from(obstacles)
    return G