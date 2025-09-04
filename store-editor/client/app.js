import { Sidebar } from './js/controllers/sidebar.js';
import { stageMap } from './js/controllers/mapController.js';

const socket = io();

// Stage setup
const stageWidth = 1000;
const stageHeight = 600;

const STORE_NUMBER = Number(3260); // Replace with dynamic value later

// Initialize the map and get the layer
stageMap(STORE_NUMBER, stageWidth, stageHeight, socket).then(({ map, layer }) => {
  // Listen for updates from other clients
  socket.on('updateShelf', (data) => {
    const shelf = layer.findOne(`#${data.id}`);
    if (shelf) {
      shelf.position({ x: data.x, y: data.y });
      layer.draw();
    }
  });

  // Save map
  document.getElementById('saveMapBtn').addEventListener('click', () => {
    saveMap(map);
  });
});
