import { moveShelf } from '../dataUtils/shelfDataApi.js';
import {
  GRID_SNAP_FT,
  shapeToStagePoints,
  snapStagePos,
  placementFromStage,
  shouldDrawMinorFootGrid,
} from './mapUnits.js';

function calculatePolygonCentroid(shape, scale_X, scale_Y) {
  let sumX = 0;
  let sumY = 0;
  const numPoints = shape.length;

  for (const [x, y] of shape) {
    sumX += x * scale_X;
    sumY += y * scale_Y;
  }

  return {
    x: sumX / numPoints,
    y: sumY / numPoints,
  };
}

export function drawFootGrid(layer, store, scale_X, scale_Y, majorSpacingFt = 100) {
  layer.find('.foot-grid-line').forEach((line) => line.destroy());
  layer.find('.foot-grid-line-minor').forEach((line) => line.destroy());

  const widthFt = store.map_size.width;
  const heightFt = store.map_size.height;
  const stageH = heightFt * scale_Y;
  const stageW = widthFt * scale_X;

  if (shouldDrawMinorFootGrid(store.map_size)) {
    for (let x = 0; x <= widthFt; x += GRID_SNAP_FT) {
      const stageX = x * scale_X;
      layer.add(
        new Konva.Line({
          points: [stageX, 0, stageX, stageH],
          stroke: '#f1f5f9',
          strokeWidth: 1,
          listening: false,
          name: 'foot-grid-line-minor',
        })
      );
    }
    for (let y = 0; y <= heightFt; y += GRID_SNAP_FT) {
      const stageY = y * scale_Y;
      layer.add(
        new Konva.Line({
          points: [0, stageY, stageW, stageY],
          stroke: '#f1f5f9',
          strokeWidth: 1,
          listening: false,
          name: 'foot-grid-line-minor',
        })
      );
    }
  }

  const major = Math.max(GRID_SNAP_FT, majorSpacingFt);
  for (let x = 0; x <= widthFt; x += major) {
    const stageX = x * scale_X;
    layer.add(
      new Konva.Line({
        points: [stageX, 0, stageX, stageH],
        stroke: '#e5e7eb',
        strokeWidth: 1,
        listening: false,
        name: 'foot-grid-line',
      })
    );
  }

  for (let y = 0; y <= heightFt; y += major) {
    const stageY = y * scale_Y;
    layer.add(
      new Konva.Line({
        points: [0, stageY, stageW, stageY],
        stroke: '#e5e7eb',
        strokeWidth: 1,
        listening: false,
        name: 'foot-grid-line',
      })
    );
  }

  layer.draw();
}

export function resolveStoreShape(store) {
  const w = store?.map_size?.width ?? 100;
  const h = store?.map_size?.height ?? 60;
  const shape = store?.store_shape;
  if (Array.isArray(shape) && shape.length >= 3) {
    const valid = shape.every(
      (pt) =>
        Array.isArray(pt) &&
        pt.length >= 2 &&
        Number.isFinite(pt[0]) &&
        Number.isFinite(pt[1])
    );
    if (valid) return shape;
  }
  return [
    [0, 0],
    [0, h],
    [w, h],
    [w, 0],
  ];
}

export function computeMapScale(store, stageWidth, stageHeight) {
  const widthFt = store.map_size.width;
  const heightFt = store.map_size.height;
  return {
    scale_X: stageWidth / widthFt,
    scale_Y: stageHeight / heightFt,
  };
}

export function computeStagePixelSize(mapSize, maxWidth, maxHeight) {
  const w = mapSize.width;
  const h = mapSize.height;
  if (!w || !h || !maxWidth || !maxHeight) {
    return {
      width: Math.floor(maxWidth) || 1000,
      height: Math.floor(maxHeight) || 600,
    };
  }
  const aspect = w / h;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return {
    width: Math.max(200, Math.floor(width)),
    height: Math.max(200, Math.floor(height)),
  };
}

export function drawStoreEdge(layer, store, scale_X, scale_Y) {
  layer.find('.store-edge-line').forEach((line) => line.destroy());

  const ring = resolveStoreShape(store);
  const scaledPoints = shapeToStagePoints(ring, scale_X, scale_Y);

  layer.add(
    new Konva.Line({
      points: scaledPoints,
      stroke: '#334155',
      strokeWidth: 3,
      dash: [8, 4],
      closed: true,
      listening: false,
      name: 'store-edge-line',
    })
  );
  layer.draw();
}

export function drawStoreBoundary(layer, store, stageWidth, stageHeight) {
  const { scale_X, scale_Y } = computeMapScale(store, stageWidth, stageHeight);
  drawStoreEdge(layer, store, scale_X, scale_Y);
  return { scale_X, scale_Y };
}

/** Remove shelf groups from the main map layer. */
export function clearMapShelfLayer(layer) {
  const remove = [];
  for (const node of layer.getChildren()) {
    if (node.getClassName() === 'Group' && node.getAttr('shelfData')) {
      remove.push(node);
    } else if (node.getClassName() === 'Text' && node.visible() === false) {
      remove.push(node);
    }
  }
  remove.forEach((n) => n.destroy());
}

export function drawShelf(layer, stage, shelfData, template, scale_X, scale_Y, socket) {
  const shape = template?.shape;
  if (!Array.isArray(shape) || shape.length < 3) {
    console.warn('Invalid template shape for shelf', shelfData.shelf_name);
    return;
  }

  const points = shapeToStagePoints(shape, scale_X, scale_Y);
  const placementX = (shelfData.placement_x || 0) * scale_X;
  const placementY = (shelfData.placement_y || 0) * scale_Y;

  const polygon = new Konva.Line({
    points,
    fill: template.color || '#828282ff',
    stroke: '#334155',
    strokeWidth: 1,
    closed: true,
    draggable: false,
    listening: true,
  });

  const centroid = calculatePolygonCentroid(shape, scale_X, scale_Y);

  const arrow = new Konva.Line({
    points: [0, -10, 0, 10, -5, 5, 0, 10, 5, 5],
    stroke: '#000',
    strokeWidth: 2,
    lineCap: 'round',
    lineJoin: 'round',
    x: centroid.x,
    y: centroid.y,
    listening: false,
  });

  const shelfNameText = new Konva.Text({
    text: shelfData.shelf_name || 'Unknown',
    fontSize: 12,
    fontFamily: 'Arial',
    fill: '#000',
    align: 'center',
    x: centroid.x,
    y: centroid.y - 25,
    visible: false,
    listening: false,
  });
  shelfNameText.offsetX(shelfNameText.width() / 2);
  shelfNameText.offsetY(shelfNameText.height() / 2);

  const shelfGroup = new Konva.Group({
    x: placementX,
    y: placementY,
    rotation: shelfData.rotation || 0,
    draggable: true,
    shelfData: shelfData,
  });

  shelfGroup.add(polygon);
  shelfGroup.add(arrow);
  shelfGroup.add(shelfNameText);
  shelfGroup.id(shelfData.shelf_name);
  layer.add(shelfGroup);

  const applySnapPosition = () => {
    const pos = shelfGroup.position();
    const snapped = snapStagePos(pos, scale_X, scale_Y);
    shelfGroup.position(snapped);
    return snapped;
  };

  shelfGroup.on('mouseenter', () => {
    polygon.strokeWidth(2);
    shelfNameText.visible(true);
    layer.batchDraw();
  });

  shelfGroup.on('mouseleave', () => {
    polygon.strokeWidth(1);
    shelfNameText.visible(false);
    layer.batchDraw();
  });

  const persistShelfPosition = () => {
    const currentShelfData = shelfGroup.getAttr('shelfData');
    const snapped = applySnapPosition();
    const { placement_x, placement_y } = placementFromStage(
      snapped,
      scale_X,
      scale_Y
    );

    if (
      placement_x === currentShelfData.placement_x &&
      placement_y === currentShelfData.placement_y
    ) {
      return;
    }

    const updatedShelfData = {
      ...currentShelfData,
      shelf_name: shelfGroup.id(),
      placement_x,
      placement_y,
    };
    shelfGroup.setAttr('shelfData', updatedShelfData);
    socket.emit('updateShelf', {
      shelf_name: shelfGroup.id(),
      x: placement_x,
      y: placement_y,
      rotation: currentShelfData.rotation,
      store_number: currentShelfData.store_number,
    });
    moveShelf(updatedShelfData, placement_x, placement_y);
    layer.batchDraw();
  };

  shelfGroup.on('dragstart', () => {
    shelfNameText.visible(false);
  });

  shelfGroup.on('dragmove', () => {
    applySnapPosition();
    layer.batchDraw();
  });

  shelfGroup.on('dragend', () => {
    persistShelfPosition();
  });

  layer.draw();
}

export function loadShelves(layer, stage, shelvesData, templates, scale_X, scale_Y, socket) {
  shelvesData.forEach((shelfData) => {
    const template = templates[shelfData.template];
    if (template) {
      drawShelf(layer, stage, shelfData, template, scale_X, scale_Y, socket);
    } else {
      console.warn('Missing template for shelf', shelfData.shelf_name);
    }
  });
}

export function drawStartingPoints(layer, startingPoints, scale_X, scale_Y) {
  layer.find('.starting-point-marker').forEach((node) => node.destroy());

  startingPoints.forEach((point) => {
    const [x, y] = point.point;
    const labelText = point.id || 'Starting Point';

    layer.add(
      new Konva.Circle({
        x: x * scale_X,
        y: y * scale_Y,
        radius: 5,
        fill: 'red',
        stroke: 'black',
        strokeWidth: 1,
        listening: false,
        name: 'starting-point-marker',
      })
    );

    layer.add(
      new Konva.Text({
        x: x * scale_X + 10,
        y: y * scale_Y - 10,
        text: labelText,
        fontSize: 14,
        fontFamily: 'Calibri',
        fill: 'black',
        listening: false,
        name: 'starting-point-marker',
      })
    );
  });

  layer.draw();
}

/** @deprecated Use clearMapShelfLayer + loadShelves after scale change. */
export function repositionShelves(layer, scale_X, scale_Y) {
  clearMapShelfLayer(layer);
}
