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
const LABEL_OFFSET_X_PX = 12;
const LABEL_OFFSET_Y_PX = 16;

export function createNameLabel(text, { name, baseFontSize }) {
  const label = new Konva.Label({ visible: false, listening: false, name });
  label.add(
    new Konva.Tag({
      fill: 'rgba(15, 23, 42, 0.82)',
      cornerRadius: 4,
      pointerDirection: 'none',
    })
  );
  label.add(
    new Konva.Text({
      text,
      fontFamily: 'Arial',
      fill: '#f8fafc',
      padding: 4,
    })
  );
  label.setAttr('baseFontSize', baseFontSize);
  return label;
}

/** Keep label text upright when parent shelf group is rotated. */
export function applyLabelUpright(label, parentNode) {
  const parentRotation = parentNode?.rotation?.() ?? 0;
  label.rotation(-parentRotation);
}

export function positionNameLabelAtPointer(label, stage, parentNode) {
  const zoom = getStageZoom(stage);
  const pointer = stage.getPointerPosition();
  if (!pointer) return;
  const transform = parentNode.getAbsoluteTransform().copy().invert();
  const local = transform.point(pointer);
  label.x(local.x + compensateForStageZoom(LABEL_OFFSET_X_PX, zoom));
  label.y(local.y - compensateForStageZoom(LABEL_OFFSET_Y_PX, zoom));
  applyLabelUpright(label, parentNode);
  // #region agent log
  if (parentNode.getAttr?.('shelfData')) {
    fetch('http://127.0.0.1:7564/ingest/326e187e-4e6f-4a2c-af02-5659473e063d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5bfbd6'},body:JSON.stringify({sessionId:'5bfbd6',location:'drawUtils.js:positionNameLabelAtPointer',message:'label upright',data:{parentRotation:parentNode.rotation(),labelRotation:label.rotation(),shelf:parentNode.id?.()},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
}

export function applyZoomCompensatedNameLabel(label, stage) {
  const zoom = getStageZoom(stage);
  const baseFont = label.getAttr('baseFontSize');
  const textNode = label.findOne('Text');
  if (textNode && Number.isFinite(baseFont)) {
    textNode.fontSize(compensateForStageZoom(baseFont, zoom));
  }
}

export function showNameLabel(label, stage, parentNode) {
  parentNode.moveToTop();
  positionNameLabelAtPointer(label, stage, parentNode);
  applyZoomCompensatedNameLabel(label, stage);
  label.visible(true);
}

/** @deprecated Use showNameLabel / applyZoomCompensatedNameLabel for Label nodes. */
export function applyZoomCompensatedShelfLabel(label, stage, parentNode) {
  if (label.getClassName() === 'Label' && parentNode) {
    positionNameLabelAtPointer(label, stage, parentNode);
    applyZoomCompensatedNameLabel(label, stage);
    return;
  }
  applyZoomCompensatedNameLabel(label, stage);
}

/** Re-apply zoom compensation for visible shelf and entrance name labels. */
export function refreshZoomCompensatedLabels(stage) {
  if (!stage) return;

  for (const group of stage.find('Group')) {
    if (group.getAttr('shelfData')) {
      const label = group.findOne('.shelf-name-label');
      if (label?.visible()) {
        positionNameLabelAtPointer(label, stage, group);
        applyZoomCompensatedNameLabel(label, stage);
      }
      continue;
    }
    if (group.name() === 'starting-point-marker') {
      const label = group.findOne('.entrance-name-label');
      if (label?.visible()) {
        positionNameLabelAtPointer(label, stage, group);
        applyZoomCompensatedNameLabel(label, stage);
      }
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

  for (const group of stage.find('.starting-point-marker')) {
    if (group.getClassName() !== 'Group') continue;
    const circle = group.findOne('Circle');
    if (!circle) continue;
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

  const shelfNameLabel = createNameLabel(shelfData.shelf_name || 'Unknown', {
    name: 'shelf-name-label',
    baseFontSize: labelFontSize,
  });

  const shelfGroup = new Konva.Group({
    x: placementX,
    y: placementY,
    rotation: shelfData.rotation || 0,
    draggable: true,
    shelfData: shelfData,
  });

  shelfGroup.add(polygon);
  shelfGroup.add(arrow);
  shelfGroup.add(shelfNameLabel);
  shelfGroup.id(shelfData.shelf_name);
  layer.add(shelfGroup);

  const showShelfLabel = () => {
    showNameLabel(shelfNameLabel, stage, shelfGroup);
    layer.batchDraw();
  };

  const hideShelfLabel = () => {
    shelfNameLabel.visible(false);
    layer.batchDraw();
  };

  const trackShelfLabel = () => {
    if (!shelfNameLabel.visible()) return;
    positionNameLabelAtPointer(shelfNameLabel, stage, shelfGroup);
    applyZoomCompensatedNameLabel(shelfNameLabel, stage);
    layer.batchDraw();
  };

  shelfGroup.on('mousemove', trackShelfLabel);

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
        showShelfLabel();
      },
      onHoverLeave: () => {
        polygon.strokeWidth(getCompensatedStrokeWidth(baseStroke, stage));
        hideShelfLabel();
      },
    });
    if (selectionManager.isSelected(shelfData.shelf_name)) {
      polygon.stroke('#2563eb');
      polygon.strokeWidth(getCompensatedStrokeWidth(hoverStroke, stage));
    }
  } else {
    shelfGroup.on('mouseenter', () => {
      polygon.strokeWidth(getCompensatedStrokeWidth(hoverStroke, stage));
      showShelfLabel();
    });

    shelfGroup.on('mouseleave', () => {
      polygon.strokeWidth(getCompensatedStrokeWidth(baseStroke, stage));
      hideShelfLabel();
    });

    shelfGroup.on('dragstart', () => {
      hideShelfLabel();
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

export function drawStartingPoints(layer, startingPoints, scale_X, scale_Y, stage) {
  layer.find('.starting-point-marker').forEach((node) => node.destroy());

  const ppf = pixelsPerFoot(scale_X, scale_Y);
  const markerRadius = clampPx(ppf * 1.5, 3, 8);
  const labelFontSize = clampPx(ppf * 6, 8, 12);

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

    const group = new Konva.Group({
      x: 0,
      y: 0,
      name: 'starting-point-marker',
      listening: true,
    });

    const circle = new Konva.Circle({
      x: stageX,
      y: stageY,
      radius: markerRadius,
      fill: 'red',
      stroke: 'black',
      strokeWidth: markerStroke,
      listening: true,
    });
    circle.setAttr('baseRadius', markerRadius);
    circle.setAttr('baseStrokeWidth', markerStroke);

    const nameLabel = createNameLabel(labelText, {
      name: 'entrance-name-label',
      baseFontSize: labelFontSize,
    });

    group.add(circle);
    group.add(nameLabel);
    layer.add(group);

    const showEntranceLabel = () => {
      if (!stage) return;
      showNameLabel(nameLabel, stage, group);
      layer.batchDraw();
    };

    const hideEntranceLabel = () => {
      nameLabel.visible(false);
      layer.batchDraw();
    };

    const trackEntranceLabel = () => {
      if (!nameLabel.visible() || !stage) return;
      positionNameLabelAtPointer(nameLabel, stage, group);
      applyZoomCompensatedNameLabel(nameLabel, stage);
      layer.batchDraw();
    };

    group.on('mouseenter', showEntranceLabel);
    group.on('mousemove', trackEntranceLabel);
    group.on('mouseleave', hideEntranceLabel);
  });

  layer.draw();
}

/** @deprecated Use clearMapShelfLayer + loadShelves after scale change. */
export function repositionShelves(layer, scale_X, scale_Y) {
  clearMapShelfLayer(layer);
}
