from flask import Flask, request, jsonify
import networkx as nx
from pathFinder import find_shortest_path
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
    data = request.json
    store = data['store']
    upcs = data['upcs']
    start = tuple(data['start'])
    end = tuple(data['end'])

    return jsonify(find_shortest_path(store, upcs, start, end))

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