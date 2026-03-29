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

# Initialize Pathfinder
pathfinder = Pathfinder(db, builder)

# Test if server is running
@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({'message': 'pong'})

# Build graph from store layout and shelves
@app.route('/graph/<int:store_number>', methods=['GET'])
def get_graph(store_number):
    graph = builder.prompt_for_graph(store_number)
    return jsonify((graph))

    
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
    store = data['store']
    upcs = data['upcs']
    # check for optional start and end points
<<<<<<< Updated upstream
    if 'start' in data and 'end' in data:
        start = tuple(data['start'])
        end = tuple(data['end'])
        return jsonify(pathfinder.find_path_with_endpoints(store, upcs, start, end))

    return jsonify(pathfinder.find_path(store, upcs))
=======
    try:
        if 'start' in data and 'end' in data:
            start = tuple(data['start'])
            end = tuple(data['end'])
            print(f"Using custom start/end points: {start} -> {end}", flush=True)
            result = pathfinder.find_path_with_endpoints(store, upcs, start, end)
        else:
            print("Using default start/end points from store", flush=True)
            result = pathfinder.find_path(store, upcs)

        print(f"Pathfinding result: {len(result) if result else 0} items", flush=True)
        return jsonify(result)

    except Exception as e:
        print(f"Error in find-path: {e}", flush=True)
        return jsonify({
            'error': 'find-path failed',
            'message': str(e),
            'details': 'Check GPU availability and DB item/shelf data'
        }), 500
>>>>>>> Stashed changes



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
    app.run(host='0.0.0.0', port=5000)