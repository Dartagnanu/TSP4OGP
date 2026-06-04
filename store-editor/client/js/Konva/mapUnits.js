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
