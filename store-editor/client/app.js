import { Sidebar } from './js/controllers/sidebar/sidebar.js';
import { mapController } from './js/controllers/mapController.js';
import { ContextMenu } from './js/controllers/contextMenu/contextMenu.js';
import { GTSP_SERVER_URL } from './config.js';


// Initialize socket.io
const socket = io();

// Stage setup
const stageWidth = 1000;
const stageHeight = 600;

const STORE_NUMBER = Number(3260); // Replace with dynamic value later

// Initialize the app
async function initApp() {
  // Initialize the mapController and stage map
  const mapCtrl = new mapController(STORE_NUMBER, stageWidth, stageHeight, socket);
  await mapCtrl.init();

  // Make mapController available globally for sidebar
  window.mapController = mapCtrl;

  // Initialize sidebar after mapController is ready (to get templates)
  const sidebar = new Sidebar(mapCtrl.stage, mapCtrl.map.store.shelf_templates, STORE_NUMBER);

  // test walks button
  document.getElementById('testWalksBtn').addEventListener('click', () => {
    mapCtrl.testWalks();
  });

  // Disable the default browser context menu
  document.getElementById('container').addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  return mapCtrl;
}

// Start the app
initApp().catch(console.error);

// test if GTSP server is running
fetch(`${GTSP_SERVER_URL}/ping`)
  .then(response => response.json())
  .then(data => {
    console.log('GTSP server is running:', data);
  })
  .catch(error => {
    console.error('Error pinging GTSP server:', error);
  });

// attempt to visualize the graph using vis-network
function visualizeGraph(graphData) {
  // Ensure every node has a string id
  const nodes = graphData.nodes.map(node => {
    let id = node.id !== undefined ? node.id : node;
    // If id is an array (e.g., [x, y]), convert to string
    if (Array.isArray(id)) id = `${id[0]},${id[1]}`;
    return {
      id: id,
      label: id
    };
  });

  const edges = graphData.links.map(link => {
    let from = link.source;
    let to = link.target;
    // If from/to are arrays, convert to string
    if (Array.isArray(from)) from = `${from[0]},${from[1]}`;
    if (Array.isArray(to)) to = `${to[0]},${to[1]}`;
    return { from, to };
  });

  const container = document.getElementById('graph');
  const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
  const options = {};
  new vis.Network(container, data, options);
  console.log('Graph visualized:', graphData);
}
// Fetch the graph data from the GTSP server and visualize it
// commented out for now since it overloads the browser with too many nodes/edges
// fetch(`${GTSP_SERVER_URL}/graph/${STORE_NUMBER}`)
//   .then(response => response.json())
//   .then(data => {
//     visualizeGraph(data);
//   console.log('Graph data fetched:', data);