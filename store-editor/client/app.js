import { Sidebar } from './js/sidebar.js';
import { createStage } from './js/Konva/konvaSetup.js';
import { drawStoreBoundary, drawShelf, loadShelves } from './js/Konva/drawUtils.js';
import { fetchMap, saveMap} from './js/mapApi.js';


const socket = io();

// Stage setup
const stageWidth = 1000;
const stageHeight = 600;

const MAP_ID = 3260; // Replace with dynamic value later
const { stage, layer } = createStage('container', stageWidth, stageHeight);
const map = await fetchMap(MAP_ID);
console.log('Fetched map');
const {scaleX, scaleY} = drawStoreBoundary(layer, map, stageWidth, stageHeight);
console.log('Scale factors:', scaleX, scaleY);
// load shelves from map
loadShelves(layer, stage, map.shelves, map.shelf_templates, scaleX, scaleY);

// add shelf data to map
function addShelfToMapData(mapData, shelfData) {
  fetch('/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shelfData, null, 2),
  });
}

//add new shelf to store
function createAndAddShelf(shelfData, template) {
  drawShelf(layer, stage, shelfData, template, scaleX, scaleY);
  addShelfToMapData(shelfData);
}
window.createAndAddShelf = createAndAddShelf;


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
