import {
  shapeToStagePoints,
  snapStagePos,
  placementFromStage,
  clampPlacementOrigin,
} from './mapUnits.js';

const PALETTE_WIDTH = 220;
const ITEM_HEIGHT = 72;
const PREVIEW_MAX = 56;

function clientToMapStage(stage, clientX, clientY) {
  const container = stage.container();
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const transform = stage.getAbsoluteTransform().copy().invert();
  return transform.point({ x, y });
}

function isPointerOverMap(stage, clientX, clientY) {
  const rect = stage.container().getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

/** Scale any foot polygon for sidebar preview (aspect from bounding box). */
function scaleShapeToPreview(shape, maxSize) {
  if (!Array.isArray(shape) || shape.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of shape) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const scale = maxSize / Math.max(w, h);
  const offsetX = (maxSize - w * scale) / 2;
  const offsetY = (maxSize - h * scale) / 2;
  return shape.flatMap(([x, y]) => [
    (x - minX) * scale + offsetX,
    (y - minY) * scale + offsetY,
  ]);
}

export class KonvaPalette {
  constructor(mapController) {
    this.mapCtrl = mapController;
    this.templates = mapController.map?.store?.shelf_templates ?? {};
    this.store_number = mapController.store_number;
    this.mapStage = mapController.stage;
    this.scale_X = mapController.scale_X;
    this.scale_Y = mapController.scale_Y;
    this.ghost = null;
    this.activeTemplateId = null;
    this._onWindowMove = null;
    this._onWindowUp = null;
  }

  updateScales(scaleX, scaleY) {
    this.scale_X = scaleX;
    this.scale_Y = scaleY;
  }

  init() {
    const sidebar = document.getElementById('sidebar');
    const height = Math.max(400, (sidebar?.clientHeight ?? 500) - 48);

    this.paletteStage = new Konva.Stage({
      container: 'palette-container',
      width: PALETTE_WIDTH,
      height,
    });
    this.paletteLayer = new Konva.Layer();
    this.paletteStage.add(this.paletteLayer);

    this.overlayLayer = new Konva.Layer({ name: 'palette-overlay', listening: false });
    this.mapStage.add(this.overlayLayer);
    this.overlayLayer.moveToTop();

    this.buildItems();
  }

  buildItems() {
    this.paletteLayer.destroyChildren();
    let y = 8;
    const templates = this.mapCtrl.map?.store?.shelf_templates ?? this.templates;
    Object.entries(templates).forEach(([id, template]) => {
      const group = this.createPaletteItem(id, template, y);
      this.paletteLayer.add(group);
      y += ITEM_HEIGHT;
    });
    this.paletteStage.height(Math.max(y + 8, this.paletteStage.height()));
    this.paletteLayer.draw();
  }

  createPaletteItem(id, template, slotY) {
    const group = new Konva.Group({
      x: 8,
      y: slotY,
      draggable: true,
      dragBoundFunc: () => ({ x: 8, y: slotY }),
    });

    group.add(
      new Konva.Rect({
        width: PALETTE_WIDTH - 16,
        height: ITEM_HEIGHT - 12,
        fill: '#ffffff',
        stroke: '#e2e8f0',
        strokeWidth: 1,
        cornerRadius: 6,
      })
    );

    group.add(
      new Konva.Line({
        x: 12,
        y: 10,
        points: scaleShapeToPreview(template.shape || [], PREVIEW_MAX),
        fill: template.color || '#94a3b8',
        stroke: '#334155',
        strokeWidth: 1,
        closed: true,
      })
    );

    group.add(
      new Konva.Text({
        x: PREVIEW_MAX + 24,
        y: 22,
        text: template.name || id,
        fontSize: 12,
        fontFamily: 'Arial',
        fill: '#0f172a',
        width: PALETTE_WIDTH - PREVIEW_MAX - 40,
        ellipsis: true,
      })
    );

    group.on('dragstart', () => {
      this.startPaletteDrag(id, template);
    });

    group.on('dragend', () => {
      group.position({ x: 8, y: slotY });
      this.paletteLayer.batchDraw();
    });

    return group;
  }

  startPaletteDrag(templateId, template) {
    this.activeTemplateId = templateId;
    this.ghost = this.createGhostGroup(template);
    this.overlayLayer.add(this.ghost);
    this.overlayLayer.moveToTop();

    this._onWindowMove = (e) => this.onDragMove(e);
    this._onWindowUp = (e) => this.onDragEnd(e);
    window.addEventListener('mousemove', this._onWindowMove);
    window.addEventListener('mouseup', this._onWindowUp);
  }

  createGhostGroup(template) {
    const points = shapeToStagePoints(
      template.shape || [],
      this.scale_X,
      this.scale_Y
    );

    const group = new Konva.Group({
      opacity: 0.55,
      listening: false,
    });
    group.add(
      new Konva.Line({
        points,
        fill: template.color || '#828282',
        stroke: '#334155',
        strokeWidth: 1,
        closed: true,
      })
    );
    return group;
  }

  onDragMove(e) {
    if (!this.ghost) return;
    const pos = clientToMapStage(this.mapStage, e.clientX, e.clientY);
    if (!pos) return;

    const snapped = snapStagePos(pos, this.scale_X, this.scale_Y);
    this.ghost.position(snapped);
    this.overlayLayer.batchDraw();
  }

  onDragEnd(e) {
    window.removeEventListener('mousemove', this._onWindowMove);
    window.removeEventListener('mouseup', this._onWindowUp);
    this._onWindowMove = null;
    this._onWindowUp = null;

    if (
      this.ghost &&
      this.activeTemplateId &&
      isPointerOverMap(this.mapStage, e.clientX, e.clientY)
    ) {
      const scaleX = this.mapCtrl.scale_X;
      const scaleY = this.mapCtrl.scale_Y;
      let { placement_x, placement_y } = placementFromStage(
        this.ghost.position(),
        scaleX,
        scaleY
      );
      const mapSize = this.mapCtrl.map?.store?.map_size;
      ({ placement_x, placement_y } = clampPlacementOrigin(
        placement_x,
        placement_y,
        mapSize
      ));

      window.createAndAddShelf({
        shelf_name: `shelf_${Date.now()}`,
        placement_x,
        placement_y,
        rotation: 0,
        modulars: [],
        flex_items: [],
        template: this.activeTemplateId,
        store_number: this.store_number,
      });
    }

    this.ghost?.destroy();
    this.ghost = null;
    this.activeTemplateId = null;
    this.overlayLayer.batchDraw();
  }
}
