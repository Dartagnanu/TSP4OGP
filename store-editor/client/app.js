import { Sidebar } from './js/sidebar.js';

const socket = io();

// Stage setup
const stageWidth = 1000;
const stageHeight = 600;
let scaleX;
let scaleY;

const stage = new Konva.Stage({
  container: 'container',
  width: stageWidth,
  height: stageHeight,
});

const layer = new Konva.Layer();
stage.add(layer);

// Draw store boundary (scaled to stage)
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
  // polygon.on('dragmove', () => {
  //   const pos = polygon.position();
  //   socket.emit('updateShelf', { id: shelfData.id, x: pos.x, y: pos.y });
  // });

  layer.draw();
}

// Fetch and render map
fetch('/map')
  .then((res) => res.json())
  .then((map) => {
    window.templates = map.shelf_templates;

    drawStoreBoundary(map.store_shape, map.map_size);

    map.shelves.forEach((shelfData) => {
      const template = window.templates[shelfData.template];
      if (!template) {
        console.warn(`Template not found: ${shelfData.template}`);
        return;
      }
      addShelf(shelfData, template);
    });

    new Sidebar(stage, window.templates);
  });

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
  fetch('/map')
    .then((res) => res.json())
    .then((map) => {
      map.shelves.forEach((shelf) => {
        const shelfNode = layer.findOne(`#${shelf.id}`);
        if (!shelfNode) return;

        const pos = shelfNode.position();
        const newX = Math.round(pos.x / scaleX);
        const newY = Math.round(pos.y / scaleY);

        shelf.placement = [newX, newY];
        shelf.rotation = shelfNode.rotation();

        console.log(`Shelf ${shelf.id} saved at (${newX}, ${newY}) rot=${shelf.rotation}`);
      });

      return fetch('/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(map),
      });
    })
    .then((res) => {
      if (!res) return; // in case previous step failed silently
      if (res.ok) {
        alert('Map saved!');
      } else {
        alert('Error saving map.');
      }
    })
    .catch((err) => {
      console.error('Save failed:', err);
      alert('Save failed. Check console.');
    });
});


document.getElementById('toggleSidebar').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const container = document.getElementById('container');
  const topBar = document.getElementById('topBar');

  if (sidebar.style.width === '0px') {
    sidebar.style.width = '200px';
    container.style.marginLeft = '200px';
    topBar.style.left = '220px';
  } else {
    sidebar.style.width = '0px';
    container.style.marginLeft = '0px';
    topBar.style.left = '20px';
  }
});
