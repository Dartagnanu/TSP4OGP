from flask import Flask, request, jsonify
import networkx as nx
from pathFinder import find_shortest_path
from gridBuilder import build_grid

app = Flask(__name__)
print("Server started")

@app.route('/build-graph', methods=['POST'])
def build_graph():
    data = request.json
    store = data['store']
    shelves = data['shelves']
    

    G = build_grid(store, shelves)
    # send the grid to the mongodb database
    # TODO: implement database storage of grid

    return jsonify({'message': 'Graph built successfully'})

    

@app.route('/find-path', methods=['POST'])
def find_path():
    data = request.json
    store = data['store']
    upcs = data['upcs']
    start = tuple(data['start'])
    end = tuple(data['end'])

    return jsonify(find_shortest_path(store, upcs, start, end))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)