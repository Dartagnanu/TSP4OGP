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

// Todo: delete function
/* Draw store boundary (scaled to stage) 
function drawStoreBoundary(storeShape, mapSize) {
  // global scales
  scaleX = stageWidth / mapSize.width;
  scaleY = stageHeight / mapSize.height;

  const points = storeShape.flatMap(([x, y]) => [x * scaleX, y * scaleY]);

  const boundary = new Konva.Line({
    points,
    fill: '#f0f0f0',
    stroke: '#000',
    strokeWidth: 2,
    closed: true,
    listening: false, // boundary is static
  });

  layer.add(boundary);
  layer.draw();
}
  

// Add a shelf or feature using its shape (placement via node position only)
function addShelf(shelfData, template) {
  // Scale template shape only; DO NOT bake placement into points
  const points = template.shape
    .map(([x, y]) => [x * scaleX, y * scaleY])
    .flat();

  console.log('Adding shelf: ', shelfData.id, '\nwith placement:', shelfData.placement);

  const color = template.color || '#828282ff';
  if (Array.isArray(shelfData.modulars) && shelfData.modulars.length === 0) {
    // keep UI stable if modulars missing
    shelfData.modulars = ['None'];
  }

  const polygon = new Konva.Line({
    points,
    fill: color,
    stroke: '#000',
    strokeWidth: 1,
    closed: true,
    draggable: true,
    rotation: shelfData.rotation || 0,
    x: (shelfData.placement?.[0] || 0) * scaleX,
    y: (shelfData.placement?.[1] || 0) * scaleY,
  });

  polygon.id(shelfData.id);
  layer.add(polygon);

  // Tooltip added
  const tooltip = new Konva.Text({
    text: `Shelf ID: ${shelfData.id}\nModulars: ${shelfData.modulars?.join(', ')}\nFlex Items: ${shelfData.flex_items?.length}\n`,
    fontSize: 14,
    fontFamily: 'Calibri',
    fill: 'black',
    padding: 5,
    visible: false,
  });
  layer.add(tooltip);

  // Show tooltip on hover
  polygon.on('mouseenter', () => {
    polygon.strokeWidth(2);
    const mousePos = stage.getPointerPosition();
    tooltip.position({ x: mousePos.x + 10, y: mousePos.y - 10 });
    tooltip.visible(true);
    layer.batchDraw();
  });

  // Update tooltip position on mouse move
  polygon.on('mousemove', () => {
    const mousePos = stage.getPointerPosition();
    tooltip.position({ x: mousePos.x + 10, y: mousePos.y - 10 });
    layer.batchDraw();
  });

  // Hide tooltip on mouse leave
  polygon.on('mouseleave', () => {
    polygon.strokeWidth(1);
    tooltip.visible(false);
    layer.batchDraw();
  });


  // live broadcast drag for realtime sync maybe?
  //polygon.on('dragmove', () => {
  //  const pos = polygon.position();
  //  socket.emit('updateShelf', { id: shelfData.id, x: pos.x, y: pos.y });
  //});

  layer.draw();
}

*/

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
