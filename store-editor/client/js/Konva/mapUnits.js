/**
 * Map coordinates are in feet. Shelf template shapes are arbitrary foot polygons
 * (rectangles, squares, L-shapes, etc.). Stage pixels derive from map_size and viewport.
 */

/** Placement and drag snap resolution in feet. */
export const GRID_SNAP_FT = 1;

/** Skip 1 ft minor grid when map cell count exceeds this (performance). */
export const MINOR_GRID_MAX_CELLS = 250000;

export function snapFeet(value, snapFt = GRID_SNAP_FT) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / snapFt) * snapFt;
}

/** Snap a foot placement (x, y) to the grid. */
export function snapPlacementFeet(placement_x, placement_y, snapFt = GRID_SNAP_FT) {
  return {
    placement_x: snapFeet(placement_x, snapFt),
    placement_y: snapFeet(placement_y, snapFt),
  };
}

/** Snap stage pixel position to the nearest foot grid using current scale. */
export function snapStagePos(pos, scaleX, scaleY, snapFt = GRID_SNAP_FT) {
  const footX = pos.x / scaleX;
  const footY = pos.y / scaleY;
  return {
    x: snapFeet(footX, snapFt) * scaleX,
    y: snapFeet(footY, snapFt) * scaleY,
  };
}

/** Convert snapped stage position to integer foot placement for Mongo. */
export function placementFromStage(stagePos, scaleX, scaleY, snapFt = GRID_SNAP_FT) {
  return snapPlacementFeet(stagePos.x / scaleX, stagePos.y / scaleY, snapFt);
}

/**
 * Scale a template shape (foot polygon) to Konva line points.
 * Works for any rectangle/square/polygon defined in 1 ft units.
 */
export function shapeToStagePoints(shape, scaleX, scaleY) {
  if (!Array.isArray(shape) || shape.length < 3) return [];
  return shape.flatMap(([x, y]) => [x * scaleX, y * scaleY]);
}

export function shouldDrawMinorFootGrid(mapSize) {
  const w = Number(mapSize?.width) || 0;
  const h = Number(mapSize?.height) || 0;
  return w > 0 && h > 0 && w * h <= MINOR_GRID_MAX_CELLS;
}

/** Keep placement origin inside map bounds (templates may extend past origin). */
export function clampPlacementOrigin(placement_x, placement_y, mapSize) {
  const w = Number(mapSize?.width) || 0;
  const h = Number(mapSize?.height) || 0;
  return {
    placement_x: Math.min(Math.max(0, placement_x), Math.max(0, w - 1)),
    placement_y: Math.min(Math.max(0, placement_y), Math.max(0, h - 1)),
  };
}

export function clampPx(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Smaller map scale axis — pixels per foot on stage. */
export function pixelsPerFoot(scaleX, scaleY) {
  return Math.min(scaleX, scaleY);
}

export function strokeWidthForMap(ppf, { min = 1, max = 2, factor = 1 } = {}) {
  return clampPx(ppf * factor, min, max);
}

/** Stage-pixel width/height of a template shape at current map scale. */
export function shapeStageBounds(shape, scaleX, scaleY) {
  if (!Array.isArray(shape) || shape.length < 1) {
    return { width: 0, height: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of shape) {
    const sx = x * scaleX;
    const sy = y * scaleY;
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  return { width: maxX - minX, height: maxY - minY };
}

const SHELF_ARROW_TEMPLATE = [0, -10, 0, 10, -5, 5, 0, 10, 5, 5];
const SHELF_ARROW_SPAN_PX = 20;

/** Direction arrow polyline scaled to total length arrowLengthPx (tip-to-tip). */
export function buildShelfArrowPoints(arrowLengthPx) {
  const scale = Math.max(3, arrowLengthPx) / SHELF_ARROW_SPAN_PX;
  return SHELF_ARROW_TEMPLATE.map((v) => v * scale);
}

/** Current Konva stage zoom (wheel scale); 1 when unset. */
export function getStageZoom(stage) {
  const z = stage?.scaleX?.();
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Keep on-screen size constant while the stage is zoomed. */
export function compensateForStageZoom(basePx, stageScale) {
  const zoom = Number.isFinite(stageScale) && stageScale > 0 ? stageScale : 1;
  return basePx / zoom;
}
