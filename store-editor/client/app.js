import { Sidebar } from './js/controllers/sidebar/sidebar.js';
import { mapController } from './js/controllers/mapController.js';
import { ContextMenu } from './js/controllers/contextMenu/contextMenu.js';

// Initialize socket.io
const socket = io();

// Stage setup
const stageWidth = 1000;
const stageHeight = 600;

const STORE_NUMBER = Number(3260); // Replace with dynamic value later

// Initialize the mapController and stage map
const mapCtrl = new mapController(STORE_NUMBER, stageWidth, stageHeight, socket);
mapCtrl.init();




// Initialize sidebar


  // test walks button
document.getElementById('testWalksBtn').addEventListener('click', () => {
  mapCtrl.testWalks();
});

// Disable the default browser context menu
document.getElementById('container').addEventListener('contextmenu', (e) => {
  e.preventDefault();
});



