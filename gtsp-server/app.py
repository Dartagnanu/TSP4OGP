import time

from flask import Flask, request, jsonify
import networkx as nx
from pathFinder import Pathfinder
from graphBuilder import GraphBuilder
from flask_cors import CORS
from pymongo import MongoClient
import os
from networkx.readwrite import json_graph

app = Flask(__name__)
CORS(app)

# MongoDB setup
mongo_url = os.environ.get('MONGO_URL', 'mongodb://mongo:27017/')
db_name = os.environ.get('MONGO_DB', 'storemaps')
client = MongoClient(mongo_url)
db = client[db_name]

#init GraphBuilder
builder = GraphBuilder(db)
pathfinder = None

def get_pathfinder():
    global pathfinder
    if pathfinder is None:
        try:
            print('Initializing Pathfinder lazily...', flush=True)
            t0 = time.perf_counter()
            pathfinder = Pathfinder(db, builder)
            elapsed = time.perf_counter() - t0
            print(
                f'Pathfinder initialized in {elapsed:.2f}s '
                f'(gpu_available={pathfinder.gpu_available})',
                flush=True,
            )
        except Exception as e:
            print(f'Pathfinder initialization failed: {e}', flush=True)
            pathfinder = None
    return pathfinder

# Test if server is running
@app.route('/ping', methods=['GET'])
def ping():
    pf = get_pathfinder()
    status = 'ready' if pf is not None else 'initializing'
    response = {
        'message': 'pong',
        'pathfinder': status,
        'app': 'gtsp-server'
    }
    print('Ping:', response, flush=True)
    return jsonify(response)

# Build graph from store layout and shelves
@app.route('/graph/<int:store_number>', methods=['GET'])
def get_graph(store_number):
    try:
        graph = builder.export_graph_json(store_number)
        return jsonify(graph)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/cache-stats', methods=['GET'])
def cache_stats():
    pf = get_pathfinder()
    if pf is None:
        return jsonify({'error': 'Pathfinder unavailable'}), 500
    return jsonify(pf.cache_stats())

    
# Find shortest path given store, list of upcs, start and end points
@app.route('/find-path', methods=['POST'])
def find_path():
    print("Received request:", request.json)
    data = request.json
    required_fields = ['store', 'upcs']
    #check for required fields
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing "{field}" in request'}), 400

    pf = get_pathfinder()
    if pf is None:
        return jsonify({'error': 'Pathfinder unavailable, check server logs'}), 500

    store = data['store']
    upcs = data['upcs']
    # check for optional start and end points
    try:
        if 'start' in data and 'end' in data:
            start = tuple(data['start'])
            end = tuple(data['end'])
            print(f"Using custom start/end points: {start} -> {end}", flush=True)
            result = pf.find_path_with_endpoints(store, upcs, start, end)
        else:
            print("Using default start/end points from store", flush=True)
            result = pf.find_path(store, upcs)

        print(f"Pathfinding result: {len(result) if result else 0} items", flush=True)
        return jsonify(result)

    except Exception as e:
        print(f"Error in find-path: {e}", flush=True)
        return jsonify({
            'error': 'find-path failed',
            'message': str(e),
            'details': 'Check GPU availability and DB item/shelf data'
        }), 500



# Get store by store number
@app.route('/store/<int:number>', methods=['GET'])
def get_store(number):
    store = db.stores.find_one({'store_number': number})
    if not store:
        return jsonify({'error': 'Store not found'}), 404
    store['_id'] = str(store['_id'])  # Convert ObjectId to string
    return jsonify(store)

# Get all shelves by store number
@app.route('/shelves', methods=['GET'])
def get_shelves():
    store_number = request.args.get('store', type=int)
    shelves = list(db.shelves.find({'store_number': store_number}))
    for shelf in shelves:
        shelf['_id'] = str(shelf['_id'])  # Convert ObjectId to string
    return jsonify(shelves)

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    # Reloader watches bind-mounted files and restarts the whole process (disrupts /find-path).
    use_reloader = os.environ.get('FLASK_USE_RELOADER', '').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=5000, debug=debug, use_reloader=use_reloader)