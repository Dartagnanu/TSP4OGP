import { moveShelf } from '../dataUtils/shelfDataApi.js';
import {
  GRID_SNAP_FT,
  shapeToStagePoints,
  snapStagePos,
  placementFromStage,
  shouldDrawMinorFootGrid,
  pixelsPerFoot,
  shapeStageBounds,
  buildShelfArrowPoints,
  strokeWidthForMap,
  clampPx,
  getStageZoom,
  compensateForStageZoom,
  getCompensatedStrokeWidth,
  effectivePixelsPerFoot,
  getVisibleStageBounds,
  chooseMinorGridSpacingForViewport,
  resolveMajorGridSpacing,
} from './mapUnits.js';

const GRID_BASE_STROKE = 1;

export function applyZoomCompensatedShelfLabel(text, stage) {
  const zoom = getStageZoom(stage);
  const baseFont = text.getAttr('baseFontSize');
  const baseOffsetY = text.getAttr('baseLabelOffsetY');
  const centroidX = text.getAttr('baseCentroidX');
  const centroidY = text.getAttr('baseCentroidY');
  if (!Number.isFinite(baseFont)) return;

  text.fontSize(compensateForStageZoom(baseFont, zoom));
  if (Number.isFinite(centroidX) && Number.isFinite(centroidY)) {
    text.x(centroidX);
    text.y(centroidY - compensateForStageZoom(baseOffsetY, zoom));
  }
  text.offsetX(text.width() / 2);
  text.offsetY(text.height() / 2);
}

export function applyZoomCompensatedMapLabel(text, stage) {
  const zoom = getStageZoom(stage);
  const baseFont = text.getAttr('baseFontSize');
  const baseX = text.getAttr('baseX');
  const baseY = text.getAttr('baseY');
  if (!Number.isFinite(baseFont)) return;

  text.fontSize(compensateForStageZoom(baseFont, zoom));
  if (Number.isFinite(baseX)) text.x(compensateForStageZoom(baseX, zoom));
  if (Number.isFinite(baseY)) text.y(compensateForStageZoom(baseY, zoom));
}

/** Re-apply zoom compensation for visible shelf hover labels and map labels. */
export function refreshZoomCompensatedLabels(stage) {
  if (!stage) return;

  for (const group of stage.find('Group')) {
    if (!group.getAttr('shelfData')) continue;
    const text = group.findOne(
      (node) => node.getClassName() === 'Text' && node.getAttr('baseFontSize')
    );
    if (text?.visible()) {
      applyZoomCompensatedShelfLabel(text, stage);
    }
  }

  for (const text of stage.find('.starting-point-marker')) {
    if (text.getClassName() === 'Text' && text.getAttr('baseFontSize')) {
      applyZoomCompensatedMapLabel(text, stage);
    }
  }

  stage.batchDraw();
}

function _addGridLine(layer, points, stroke, name) {
  const line = new Konva.Line({
    points,
    stroke,
    strokeWidth: GRID_BASE_STROKE,
    listening: false,
    name,
  });
  line.setAttr('baseStrokeWidth', GRID_BASE_STROKE);
  layer.add(line);
  return line;
}

function _drawFullMapMinorGrid(layer, widthFt, heightFt, scale_X, scale_Y) {
  const stageH = heightFt * scale_Y;
  const stageW = widthFt * scale_X;
  for (let x = 0; x <= widthFt; x += GRID_SNAP_FT) {
    const stageX = x * scale_X;
    _addGridLine(
      layer,
      [stageX, 0, stageX, stageH],
      '#f1f5f9',
      'foot-grid-line-minor'
    );
  }
  for (let y = 0; y <= heightFt; y += GRID_SNAP_FT) {
    const stageY = y * scale_Y;
    _addGridLine(
      layer,
      [0, stageY, stageW, stageY],
      '#f1f5f9',
      'foot-grid-line-minor'
    );
  }
}

function _drawViewportMinorGrid(layer, store, scale_X, scale_Y, stage) {
  const widthFt = store.map_size.width;
  const heightFt = store.map_size.height;
  const stageH = heightFt * scale_Y;
  const stageW = widthFt * scale_X;
  const ppf = pixelsPerFoot(scale_X, scale_Y);
  const effPpf = effectivePixelsPerFoot(ppf, stage);
  const bounds = getVisibleStageBounds(stage);

  const x0ft = Math.max(0, Math.floor(bounds.x0 / scale_X));
  const x1ft = Math.min(widthFt, Math.ceil(bounds.x1 / scale_X));
  const y0ft = Math.max(0, Math.floor(bounds.y0 / scale_Y));
  const y1ft = Math.min(heightFt, Math.ceil(bounds.y1 / scale_Y));
  const viewportWFt = x1ft - x0ft;
  const viewportHFt = y1ft - y0ft;

  const spacing = chooseMinorGridSpacingForViewport(
    viewportWFt,
    viewportHFt,
    effPpf
  );
  if (!spacing) return;

  const startX = Math.floor(x0ft / spacing) * spacing;
  const startY = Math.floor(y0ft / spacing) * spacing;

  for (let x = startX; x <= x1ft; x += spacing) {
    const stageX = x * scale_X;
    _addGridLine(
      layer,
      [stageX, 0, stageX, stageH],
      '#f1f5f9',
      'foot-grid-line-minor'
    );
  }
  for (let y = startY; y <= y1ft; y += spacing) {
    const stageY = y * scale_Y;
    _addGridLine(
      layer,
      [0, stageY, stageW, stageY],
      '#f1f5f9',
      'foot-grid-line-minor'
    );
  }
}

/** Recompute viewport-culled minor grid for large maps (destroy-then-redraw). */
export function redrawViewportGrid(layer, store, scale_X, scale_Y, stage) {
  if (!layer || !store || !stage) return;
  if (shouldDrawMinorFootGrid(store.map_size)) return;

  layer.find('.foot-grid-line-minor').forEach((line) => line.destroy());
  _drawViewportMinorGrid(layer, store, scale_X, scale_Y, stage);
  layer.batchDraw();
}

/** Re-apply zoom compensation for boundary, grid, shelves, arrows, starting points. */
export function refreshZoomCompensatedMapChrome(stage, selectionManager = null) {
  if (!stage) return;
  const zoom = getStageZoom(stage);
  const selectedNames = selectionManager?.selectedNames;

  for (const line of stage.find('.store-edge-line')) {
    const baseStroke = line.getAttr('baseStrokeWidth');
    const baseDashMain = line.getAttr('baseDashMain');
    const baseDashGap = line.getAttr('baseDashGap');
    if (Number.isFinite(baseStroke)) {
      line.strokeWidth(compensateForStageZoom(baseStroke, zoom));
    }
    if (Number.isFinite(baseDashMain) && Number.isFinite(baseDashGap)) {
      line.dash([
        compensateForStageZoom(baseDashMain, zoom),
        compensateForStageZoom(baseDashGap, zoom),
      ]);
    }
  }

  for (const line of stage.find('.foot-grid-line, .foot-grid-line-minor')) {
    const baseStroke = line.getAttr('baseStrokeWidth') ?? GRID_BASE_STROKE;
    line.strokeWidth(compensateForStageZoom(baseStroke, zoom));
  }

  for (const group of stage.find('Group')) {
    if (!group.getAttr('shelfData')) continue;
    const polygon = group.findOne(
      (n) => n.getClassName() === 'Line' && n.closed()
    );
    const arrow = group.findOne(
      (n) => n.getClassName() === 'Line' && !n.closed()
    );
    if (!polygon) continue;

    const base = polygon.getAttr('baseStrokeWidth') ?? 1;
    const hover = polygon.getAttr('hoverStrokeWidth') ?? base * 2;
    const selected = selectedNames?.has(group.id());
    const strokeBase = selected ? hover : base;
    polygon.stroke(selected ? '#2563eb' : '#334155');
    polygon.strokeWidth(compensateForStageZoom(strokeBase, zoom));

    if (arrow) {
      const arrowBaseStroke = arrow.getAttr('baseStrokeWidth');
      const arrowBaseLen = arrow.getAttr('baseArrowLen');
      if (Number.isFinite(arrowBaseStroke)) {
        arrow.strokeWidth(compensateForStageZoom(arrowBaseStroke, zoom));
      }
      if (Number.isFinite(arrowBaseLen)) {
        arrow.points(
          buildShelfArrowPoints(compensateForStageZoom(arrowBaseLen, zoom))
        );
      }
    }
  }

  for (const circle of stage.find('.starting-point-marker')) {
    if (circle.getClassName() !== 'Circle') continue;
    const baseRadius = circle.getAttr('baseRadius');
    const baseStroke = circle.getAttr('baseStrokeWidth');
    if (Number.isFinite(baseRadius)) {
      circle.radius(compensateForStageZoom(baseRadius, zoom));
    }
    if (Number.isFinite(baseStroke)) {
      circle.strokeWidth(compensateForStageZoom(baseStroke, zoom));
    }
  }

  stage.batchDraw();
}

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

export function drawFootGrid(
  layer,
  store,
  scale_X,
  scale_Y,
  majorSpacingFt = 100,
  stage = null
) {
  layer.find('.foot-grid-line').forEach((line) => line.destroy());
  layer.find('.foot-grid-line-minor').forEach((line) => line.destroy());

  const widthFt = store.map_size.width;
  const heightFt = store.map_size.height;
  const stageH = heightFt * scale_Y;
  const stageW = widthFt * scale_X;

  if (shouldDrawMinorFootGrid(store.map_size)) {
    _drawFullMapMinorGrid(layer, widthFt, heightFt, scale_X, scale_Y);
  } else if (stage) {
    _drawViewportMinorGrid(layer, store, scale_X, scale_Y, stage);
  }

  const major = Math.max(
    GRID_SNAP_FT,
    resolveMajorGridSpacing(store.map_size, majorSpacingFt)
  );
  for (let x = 0; x <= widthFt; x += major) {
    const stageX = x * scale_X;
    _addGridLine(
      layer,
      [stageX, 0, stageX, stageH],
      '#e5e7eb',
      'foot-grid-line'
    );
  }

  for (let y = 0; y <= heightFt; y += major) {
    const stageY = y * scale_Y;
    _addGridLine(
      layer,
      [0, stageY, stageW, stageY],
      '#e5e7eb',
      'foot-grid-line'
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
  const ppf = pixelsPerFoot(scale_X, scale_Y);
  const edgeStroke = strokeWidthForMap(ppf, { min: 1, max: 2.5, factor: 1.2 });
  const dashSeg = Math.max(4, ppf * 2);
  const dashGap = Math.max(4, ppf);

  const edgeLine = new Konva.Line({
    points: scaledPoints,
    stroke: '#334155',
    strokeWidth: edgeStroke,
    dash: [dashSeg, dashGap],
    closed: true,
    listening: false,
    name: 'store-edge-line',
  });
  edgeLine.setAttr('baseStrokeWidth', edgeStroke);
  edgeLine.setAttr('baseDashMain', dashSeg);
  edgeLine.setAttr('baseDashGap', dashGap);
  layer.add(edgeLine);
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

export function drawShelf(
  layer,
  stage,
  shelfData,
  template,
  scale_X,
  scale_Y,
  socket,
  selectionManager = null
) {
  const shape = template?.shape;
  if (!Array.isArray(shape) || shape.length < 3) {
    console.warn('Invalid template shape for shelf', shelfData.shelf_name);
    return;
  }

  const points = shapeToStagePoints(shape, scale_X, scale_Y);
  const placementX = (shelfData.placement_x || 0) * scale_X;
  const placementY = (shelfData.placement_y || 0) * scale_Y;

  const ppf = pixelsPerFoot(scale_X, scale_Y);
  const bounds = shapeStageBounds(shape, scale_X, scale_Y);
  const baseStroke = strokeWidthForMap(ppf, { min: 0.75, max: 1.5, factor: 0.2 });
  const hoverStroke = clampPx(baseStroke * 2, baseStroke, 3);
  const arrowLen = Math.max(
    3,
    Math.min(
      Math.min(bounds.width, bounds.height) * 0.45,
      Math.min(bounds.width, bounds.height)
    )
  );
  const arrowStroke = strokeWidthForMap(ppf, { min: 0.75, max: 2, factor: 0.35 });
  const labelFontSize = clampPx(ppf * 6, 8, 12);
  const labelOffsetY = arrowLen * 0.5 + labelFontSize * 0.5;

  const polygon = new Konva.Line({
    points,
    fill: template.color || '#828282ff',
    stroke: '#334155',
    strokeWidth: baseStroke,
    closed: true,
    draggable: false,
    listening: true,
  });
  polygon.setAttr('baseStrokeWidth', baseStroke);
  polygon.setAttr('hoverStrokeWidth', hoverStroke);

  const centroid = calculatePolygonCentroid(shape, scale_X, scale_Y);

  const arrow = new Konva.Line({
    points: buildShelfArrowPoints(arrowLen),
    stroke: '#000',
    strokeWidth: arrowStroke,
    lineCap: 'round',
    lineJoin: 'round',
    x: centroid.x,
    y: centroid.y,
    listening: false,
  });
  arrow.setAttr('baseStrokeWidth', arrowStroke);
  arrow.setAttr('baseArrowLen', arrowLen);

  const shelfNameText = new Konva.Text({
    text: shelfData.shelf_name || 'Unknown',
    fontSize: labelFontSize,
    fontFamily: 'Arial',
    fill: '#000',
    align: 'center',
    x: centroid.x,
    y: centroid.y - labelOffsetY,
    visible: false,
    listening: false,
  });
  shelfNameText.setAttr('baseFontSize', labelFontSize);
  shelfNameText.setAttr('baseLabelOffsetY', labelOffsetY);
  shelfNameText.setAttr('baseCentroidX', centroid.x);
  shelfNameText.setAttr('baseCentroidY', centroid.y);
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

  const persistSingleShelf = async (group = shelfGroup) => {
    const currentShelfData = group.getAttr('shelfData');
    const pos = group.position();
    const snapped = snapStagePos(pos, scale_X, scale_Y);
    group.position(snapped);
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
      shelf_name: group.id(),
      placement_x,
      placement_y,
    };
    group.setAttr('shelfData', updatedShelfData);

    const mapShelves = selectionManager?.mapController?.map?.shelves;
    if (mapShelves) {
      const i = mapShelves.findIndex((s) => s.shelf_name === group.id());
      if (i >= 0) mapShelves[i] = updatedShelfData;
    }

    socket.emit('updateShelf', {
      shelf_name: group.id(),
      x: placement_x,
      y: placement_y,
      rotation: currentShelfData.rotation,
      store_number: currentShelfData.store_number,
    });
    await moveShelf(updatedShelfData, placement_x, placement_y);
  };

  const applySnapToGroup = (group = shelfGroup) => {
    const pos = group.position();
    const snapped = snapStagePos(pos, scale_X, scale_Y);
    group.position(snapped);
    return snapped;
  };

  if (selectionManager) {
    selectionManager.registerShelfGroup(shelfGroup, polygon, {
      applySnapPosition: applySnapToGroup,
      persistSingleShelf,
      onHoverEnter: () => {
        polygon.strokeWidth(getCompensatedStrokeWidth(hoverStroke, stage));
        applyZoomCompensatedShelfLabel(shelfNameText, stage);
        shelfNameText.visible(true);
        layer.batchDraw();
      },
      onHoverLeave: () => {
        polygon.strokeWidth(getCompensatedStrokeWidth(baseStroke, stage));
        shelfNameText.visible(false);
        layer.batchDraw();
      },
    });
    if (selectionManager.isSelected(shelfData.shelf_name)) {
      polygon.stroke('#2563eb');
      polygon.strokeWidth(getCompensatedStrokeWidth(hoverStroke, stage));
    }
  } else {
    shelfGroup.on('mouseenter', () => {
      polygon.strokeWidth(getCompensatedStrokeWidth(hoverStroke, stage));
      applyZoomCompensatedShelfLabel(shelfNameText, stage);
      shelfNameText.visible(true);
      layer.batchDraw();
    });

    shelfGroup.on('mouseleave', () => {
      polygon.strokeWidth(getCompensatedStrokeWidth(baseStroke, stage));
      shelfNameText.visible(false);
      layer.batchDraw();
    });

    shelfGroup.on('dragstart', () => {
      shelfNameText.visible(false);
    });

    shelfGroup.on('dragmove', () => {
      applySnapToGroup();
      layer.batchDraw();
    });

    shelfGroup.on('dragend', () => {
      persistSingleShelf();
    });
  }

  layer.draw();
}

export function loadShelves(
  layer,
  stage,
  shelvesData,
  templates,
  scale_X,
  scale_Y,
  socket,
  selectionManager = null
) {
  shelvesData.forEach((shelfData) => {
    const template = templates[shelfData.template];
    if (template) {
      drawShelf(
        layer,
        stage,
        shelfData,
        template,
        scale_X,
        scale_Y,
        socket,
        selectionManager
      );
    } else {
      console.warn('Missing template for shelf', shelfData.shelf_name);
    }
  });
}

export function drawStartingPoints(layer, startingPoints, scale_X, scale_Y) {
  layer.find('.starting-point-marker').forEach((node) => node.destroy());

  const ppf = pixelsPerFoot(scale_X, scale_Y);
  const markerRadius = clampPx(ppf * 1.5, 3, 8);
  const labelFontSize = clampPx(ppf * 6, 8, 12);
  const labelOffset = markerRadius + 2;

  startingPoints.forEach((point) => {
    const [x, y] = point.point;
    const labelText = point.id || 'Starting Point';
    const stageX = x * scale_X;
    const stageY = y * scale_Y;

    const markerStroke = strokeWidthForMap(ppf, {
      min: 0.75,
      max: 1.5,
      factor: 0.2,
    });
    const circle = new Konva.Circle({
      x: stageX,
      y: stageY,
      radius: markerRadius,
      fill: 'red',
      stroke: 'black',
      strokeWidth: markerStroke,
      listening: false,
      name: 'starting-point-marker',
    });
    circle.setAttr('baseRadius', markerRadius);
    circle.setAttr('baseStrokeWidth', markerStroke);
    layer.add(circle);

    const label = new Konva.Text({
      x: stageX + labelOffset,
      y: stageY - labelOffset,
      text: labelText,
      fontSize: labelFontSize,
      fontFamily: 'Calibri',
      fill: 'black',
      listening: false,
      name: 'starting-point-marker',
    });
    label.setAttr('baseFontSize', labelFontSize);
    label.setAttr('baseX', stageX + labelOffset);
    label.setAttr('baseY', stageY - labelOffset);
    layer.add(label);
  });

  layer.draw();
}

/** @deprecated Use clearMapShelfLayer + loadShelves after scale change. */
export function repositionShelves(layer, scale_X, scale_Y) {
  clearMapShelfLayer(layer);
}
