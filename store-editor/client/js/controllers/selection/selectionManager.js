import {
  placementFromStage,
  clampPlacementOrigin,
} from '../../konva/mapUnits.js';
import { applyZoomCompensatedShelfLabel } from '../../konva/drawUtils.js';
import { moveShelf } from '../../dataUtils/shelfDataApi.js';
import { askPasteKeepItems } from './pasteOptionsModal.js';

const SELECTION_STROKE = '#2563eb';

export class SelectionManager {
  constructor(mapController) {
    this.mapController = mapController;
    this.selectedNames = new Set();
    this.clipboard = null;
    this.lastPastePointerFt = null;
    this._groupDrag = null;
    this._marquee = null;
    this._overlayLayer = null;
  }

  init() {
    const { stage, layer } = this.mapController;
    if (!stage || !layer) return;

    this._overlayLayer = new Konva.Layer({ name: 'selection-overlay', listening: false });
    stage.add(this._overlayLayer);
    this._overlayLayer.moveToTop();

    stage.on('click', (e) => {
      const t = e.target;
      if (t?.getAttr?.('shelfData') || t?.parent?.getAttr?.('shelfData')) return;
      if (t === stage || t.getLayer?.() === this.mapController.gridLayer) {
        this.clear();
      }
    });

    this._setupMarquee(stage);
    this._setupKeyboard();
  }

  get count() {
    return this.selectedNames.size;
  }

  hasClipboard() {
    return Boolean(this.clipboard?.shelves?.length);
  }

  isSelected(shelfName) {
    return this.selectedNames.has(shelfName);
  }

  selectOne(shelfName) {
    this.selectedNames.clear();
    if (shelfName) this.selectedNames.add(shelfName);
    this.applySelectionStyles();
  }

  toggle(shelfName) {
    if (this.selectedNames.has(shelfName)) {
      this.selectedNames.delete(shelfName);
    } else {
      this.selectedNames.add(shelfName);
    }
    this.applySelectionStyles();
  }

  selectMany(names, { append = false } = {}) {
    if (!append) this.selectedNames.clear();
    for (const name of names) {
      if (name) this.selectedNames.add(name);
    }
    this.applySelectionStyles();
  }

  clear() {
    this.selectedNames.clear();
    this.applySelectionStyles();
  }

  removeFromSelection(shelfName) {
    this.selectedNames.delete(shelfName);
    this.applySelectionStyles();
  }

  _getShelfGroup(shelfName) {
    return this.mapController.layer?.findOne(`#${shelfName}`);
  }

  _getPolygon(group) {
    return group?.findOne((n) => n.getClassName() === 'Line' && n.closed());
  }

  applySelectionStyles() {
    const layer = this.mapController.layer;
    if (!layer) return;

    const stage = this.mapController.stage;

    for (const child of layer.getChildren()) {
      if (child.getClassName() !== 'Group' || !child.getAttr('shelfData')) continue;
      const polygon = this._getPolygon(child);
      if (!polygon) continue;
      const label = child.findOne((n) => n.getClassName() === 'Text');
      const base = polygon.getAttr('baseStrokeWidth') ?? 1;
      const hover = polygon.getAttr('hoverStrokeWidth') ?? base * 2;
      const selected = this.selectedNames.has(child.id());

      if (selected) {
        polygon.stroke(SELECTION_STROKE);
        polygon.strokeWidth(hover);
        if (label && stage) {
          applyZoomCompensatedShelfLabel(label, stage);
          label.visible(true);
        }
      } else {
        polygon.stroke('#334155');
        polygon.strokeWidth(base);
        label?.visible(false);
      }
    }
    layer.batchDraw();
  }

  registerShelfGroup(shelfGroup, polygon, handlers) {
    const { applySnapPosition, persistSingleShelf, onHoverEnter, onHoverLeave } = handlers;

    shelfGroup.on('click', (e) => {
      if (e.evt.button !== 0) return;
      e.cancelBubble = true;
      const name = shelfGroup.id();
      if (e.evt.shiftKey) {
        this.toggle(name);
      } else {
        this.selectOne(name);
      }
    });

    shelfGroup.on('contextmenu', (e) => {
      this._onShelfContextMenu?.(e, shelfGroup);
    });

    shelfGroup.on('mouseenter', () => {
      if (!this.isSelected(shelfGroup.id())) {
        onHoverEnter?.();
      }
    });

    shelfGroup.on('mouseleave', () => {
      if (!this.isSelected(shelfGroup.id())) {
        onHoverLeave?.();
      }
    });

    shelfGroup.on('dragstart', () => {
      const name = shelfGroup.id();
      if (!this.isSelected(name)) {
        this.selectOne(name);
      }
      this._beginGroupDrag(shelfGroup, applySnapPosition);
      shelfGroup.findOne('Text')?.visible(false);
    });

    shelfGroup.on('dragmove', () => {
      this._moveGroupDrag(shelfGroup, applySnapPosition);
      this.mapController.layer.batchDraw();
    });

    shelfGroup.on('dragend', async () => {
      await this._endGroupDrag(applySnapPosition, persistSingleShelf);
      this.mapController.layer.batchDraw();
    });
  }

  _beginGroupDrag(leaderGroup, applySnapPosition) {
    const leaderName = leaderGroup.id();
    const names =
      this.selectedNames.has(leaderName) && this.selectedNames.size > 1
        ? [...this.selectedNames]
        : [leaderName];

    applySnapPosition(leaderGroup);
    const leaderPos = leaderGroup.position();
    const startPositions = new Map();

    for (const name of names) {
      const group = this._getShelfGroup(name);
      if (!group) continue;
      startPositions.set(name, { ...group.position() });
    }

    this._groupDrag = {
      leaderName,
      names,
      leaderStart: { ...leaderPos },
      startPositions,
    };
  }

  _moveGroupDrag(leaderGroup, applySnapPosition) {
    if (!this._groupDrag) return;
    applySnapPosition(leaderGroup);
    const leaderPos = leaderGroup.position();
    const dx = leaderPos.x - this._groupDrag.leaderStart.x;
    const dy = leaderPos.y - this._groupDrag.leaderStart.y;

    for (const name of this._groupDrag.names) {
      if (name === this._groupDrag.leaderName) continue;
      const group = this._getShelfGroup(name);
      const start = this._groupDrag.startPositions.get(name);
      if (!group || !start) continue;
      group.position({ x: start.x + dx, y: start.y + dy });
    }
  }

  async _endGroupDrag(applySnapPosition, persistSingleShelf) {
    if (!this._groupDrag) return;
    const { names, leaderName } = this._groupDrag;
    const leader = this._getShelfGroup(leaderName);
    if (leader) applySnapPosition(leader);

    const tasks = [];
    for (const name of names) {
      const group = this._getShelfGroup(name);
      if (!group) continue;
      applySnapPosition(group);
      tasks.push(persistSingleShelf(group));
    }
    await Promise.all(tasks);
    this._groupDrag = null;
  }

  _setupMarquee(stage) {
    let rect = null;
    let start = null;
    let shiftHeld = false;

    stage.on('mousedown', (e) => {
      if (e.evt.button !== 0) return;
      const target = e.target;
      const onShelf =
        target?.getAttr?.('shelfData') ||
        target?.parent?.getAttr?.('shelfData');
      if (onShelf) return;

      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      shiftHeld = e.evt.shiftKey;
      start = { x: pos.x, y: pos.y };
      rect = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        stroke: SELECTION_STROKE,
        strokeWidth: 1,
        dash: [4, 4],
        fill: 'rgba(37, 99, 235, 0.08)',
        listening: false,
        name: 'marquee-rect',
      });
      this._overlayLayer.add(rect);
      this._overlayLayer.moveToTop();
      this._marquee = { rect, start };
    });

    stage.on('mousemove', () => {
      if (!this._marquee?.rect || !this._marquee.start) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      const { start: s } = this._marquee;
      const x = Math.min(s.x, pos.x);
      const y = Math.min(s.y, pos.y);
      const w = Math.abs(pos.x - s.x);
      const h = Math.abs(pos.y - s.y);
      this._marquee.rect.setAttrs({ x, y, width: w, height: h });
      this._overlayLayer.batchDraw();
    });

    stage.on('mouseup', () => {
      if (!this._marquee?.rect) return;
      const box = this._marquee.rect.getClientRect();
      this._marquee.rect.destroy();
      this._marquee = null;
      this._overlayLayer.batchDraw();

      if (box.width < 4 && box.height < 4) return;

      const hits = [];
      for (const child of this.mapController.layer.getChildren()) {
        if (child.getClassName() !== 'Group' || !child.getAttr('shelfData')) continue;
        const cr = child.getClientRect();
        const intersects =
          cr.x < box.x + box.width &&
          cr.x + cr.width > box.x &&
          cr.y < box.y + box.height &&
          cr.y + cr.height > box.y;
        if (intersects) hits.push(child.id());
      }

      if (shiftHeld) {
        this.selectMany(hits, { append: true });
      } else {
        this.selectMany(hits);
      }
    });
  }

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (this.count === 0) return;
        e.preventDefault();
        this.copySelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (!this.hasClipboard()) return;
        e.preventDefault();
        this.pasteAtPointer();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.count === 0) return;
        e.preventDefault();
        this.deleteSelection();
      }
    });
  }

  setPastePointerFromStage(stagePos) {
    const { scale_X, scale_Y } = this.mapController;
    const feet = placementFromStage(stagePos, scale_X, scale_Y);
    this.lastPastePointerFt = clampPlacementOrigin(
      feet.placement_x,
      feet.placement_y,
      this.mapController.map?.store?.map_size
    );
  }

  copySelection() {
    if (this.count === 0) return false;

    const shelves = [];
    let minX = Infinity;
    let minY = Infinity;

    for (const name of this.selectedNames) {
      const data =
        this.mapController.map.shelves.find((s) => s.shelf_name === name) ||
        this._getShelfGroup(name)?.getAttr('shelfData');
      if (!data) continue;
      minX = Math.min(minX, data.placement_x);
      minY = Math.min(minY, data.placement_y);
      shelves.push(data);
    }

    if (shelves.length === 0) return false;

    this.clipboard = {
      store_number: this.mapController.store_number,
      anchor: { x: minX, y: minY },
      shelves: shelves.map((s) => ({
        template: s.template,
        rotation: s.rotation ?? 0,
        department: s.department ?? '',
        relX: s.placement_x - minX,
        relY: s.placement_y - minY,
        modulars: [...(s.modulars || [])],
        flex_items: [...(s.flex_items || [])],
        sourceName: s.shelf_name,
      })),
    };
    return true;
  }

  async pasteAtPointer() {
    const pointer = this.lastPastePointerFt;
    if (!pointer) {
      alert('Right-click on the map where you want to paste, then choose Paste.');
      return [];
    }
    return this.pasteAt(pointer.placement_x, pointer.placement_y);
  }

  async pasteAt(pasteX, pasteY) {
    if (!this.clipboard?.shelves?.length) return [];

    if (this.clipboard.store_number !== this.mapController.store_number) {
      alert('Clipboard is from a different store.');
      return [];
    }

    const keepItems = await askPasteKeepItems(this.clipboard.shelves.length);
    if (keepItems === null) return [];

    const ts = Date.now();
    const createdNames = [];
    const mapSize = this.mapController.map?.store?.map_size;

    for (let i = 0; i < this.clipboard.shelves.length; i += 1) {
      const item = this.clipboard.shelves[i];
      let { placement_x, placement_y } = clampPlacementOrigin(
        pasteX + item.relX,
        pasteY + item.relY,
        mapSize
      );

      const shelfData = {
        store_number: this.mapController.store_number,
        shelf_name: `${item.sourceName}_paste_${ts}_${i}`,
        template: item.template,
        placement_x,
        placement_y,
        rotation: item.rotation,
        department: item.department,
        modulars: keepItems ? item.modulars : [],
        flex_items: keepItems ? item.flex_items : [],
      };

      try {
        const merged = await this.mapController.createAndAddShelf(shelfData);
        createdNames.push(merged.shelf_name);
      } catch (err) {
        console.error('Paste failed for shelf', shelfData.shelf_name, err);
      }
    }

    this.clear();
    this.selectMany(createdNames);
    this.mapController.layer.batchDraw();
    return createdNames;
  }

  async deleteSelection() {
    if (this.count === 0) return;

    const names = [...this.selectedNames];
    if (names.length > 1) {
      const ok = window.confirm(`Delete ${names.length} shelves?`);
      if (!ok) return;
    }

    for (const name of names) {
      this.mapController.deleteShelfFromMap(name);
    }
    this.clear();
  }

  handleShelfContextMenu(shelfName) {
    if (!this.isSelected(shelfName)) {
      this.selectOne(shelfName);
    }
  }
}
