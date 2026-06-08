import { ShelfEditor } from './shelfEditor.js';
import {
  placementFromStage,
  clampPlacementOrigin,
} from '../../konva/mapUnits.js';

export class ContextMenu {
  constructor(mapController) {
    this.mapController = mapController;
    this.contextMenu = document.getElementById('contextMenu');
    this.multiShelfContextMenu = document.getElementById('multiShelfContextMenu');
    this.addShelfBtn = document.getElementById('addShelfBtn');
    this.deleteShelfBtn = document.getElementById('deleteShelfBtn');
    this.copyShelfBtn = document.getElementById('copyShelfBtn');
    this.pasteShelfBtn = document.getElementById('pasteShelfBtn');
    this.editShelfBtn = document.getElementById('editShelfBtn');
    this.copyShelvesBtn = document.getElementById('copyShelvesBtn');
    this.deleteShelvesBtn = document.getElementById('deleteShelvesBtn');
    this.isDraggingMap = false;
    this.shelfEditor = new ShelfEditor(mapController);
  }

  get selection() {
    return this.mapController.selectionManager;
  }

  init() {
    this.selection._onShelfContextMenu = (e, g) =>
      this.handleShelfKonvaContextMenu(e, g);
    this.setupContextMenu();
    this.setupMapDrag();
  }

  _hideMenu() {
    if (this.contextMenu) this.contextMenu.style.display = 'none';
    if (this.multiShelfContextMenu) this.multiShelfContextMenu.style.display = 'none';
  }

  _showMenuAt(menuEl, evt) {
    if (!menuEl || !evt) return;
    menuEl.style.display = 'block';
    menuEl.style.left = `${evt.clientX}px`;
    menuEl.style.top = `${evt.clientY}px`;
  }

  _resolveShelfGroup(target) {
    if (target?.getAttr?.('shelfData')) return target;
    if (target?.parent?.getAttr?.('shelfData')) return target.parent;
    const id = target?.id?.();
    if (id) {
      return this.mapController.layer.findOne(`#${id}`);
    }
    return null;
  }

  handleShelfKonvaContextMenu(e, shelfGroup) {
    const shelfData = shelfGroup?.getAttr?.('shelfData');
    if (!shelfData) return;

    e.evt?.preventDefault();

    this.selection?.setPastePointerFromStage(
      this.mapController.stage.getRelativePointerPosition()
    );
    this.selection?.handleShelfContextMenu(shelfData.shelf_name);

    const count = this.selection?.count ?? 1;

    if (count > 1) {
      if (!this.multiShelfContextMenu) return;
      this._showMenuAt(this.multiShelfContextMenu, e.evt);

      if (this.copyShelvesBtn) {
        this.copyShelvesBtn.onclick = () => {
          this.selection?.copySelection();
          this._hideMenu();
        };
      }
      if (this.deleteShelvesBtn) {
        this.deleteShelvesBtn.onclick = () => {
          this.selection?.deleteSelection();
          this._hideMenu();
        };
      }
      return;
    }

    if (!this.contextMenu) return;
    this._showMenuAt(this.contextMenu, e.evt);

    if (this.addShelfBtn) this.addShelfBtn.style.display = 'none';
    if (this.pasteShelfBtn) this.pasteShelfBtn.style.display = 'none';
    if (this.deleteShelfBtn) this.deleteShelfBtn.style.display = '';
    if (this.copyShelfBtn) this.copyShelfBtn.style.display = '';
    if (this.editShelfBtn) this.editShelfBtn.style.display = '';

    if (this.editShelfBtn) {
      this.editShelfBtn.onclick = () => {
        this.shelfEditor.openEditor(shelfData);
        this._hideMenu();
      };
    }
    if (this.deleteShelfBtn) {
      this.deleteShelfBtn.onclick = () => {
        this.selection?.deleteSelection();
        this._hideMenu();
      };
    }
    if (this.copyShelfBtn) {
      this.copyShelfBtn.onclick = () => {
        this.selection?.copySelection();
        this._hideMenu();
      };
    }
  }

  _showEmptyMapMenu(e, pointer) {
    if (!this.contextMenu) return;
    e.evt?.preventDefault();

    if (pointer) {
      this.selection?.setPastePointerFromStage(pointer);
    }

    this._showMenuAt(this.contextMenu, e.evt);

    const hasClip = this.selection?.hasClipboard();
    if (this.addShelfBtn) this.addShelfBtn.style.display = '';
    if (this.pasteShelfBtn) {
      this.pasteShelfBtn.style.display = hasClip ? '' : 'none';
    }
    if (this.deleteShelfBtn) this.deleteShelfBtn.style.display = 'none';
    if (this.copyShelfBtn) this.copyShelfBtn.style.display = 'none';
    if (this.editShelfBtn) this.editShelfBtn.style.display = 'none';

    if (this.pasteShelfBtn) {
      this.pasteShelfBtn.onclick = async () => {
        try {
          await this.selection?.pasteAtPointer();
        } catch (err) {
          console.error('Paste failed:', err);
          alert(err.message || 'Paste failed');
        }
        this._hideMenu();
      };
    }

    if (this.addShelfBtn) {
      this.addShelfBtn.onclick = () => {
        const templates = this.mapController.map.store.shelf_templates;
        const templateKey = Object.keys(templates)[0];
        const clickPointer = this.mapController.stage.getRelativePointerPosition();
        if (!clickPointer) return;

        const { scale_X, scale_Y } = this.mapController;
        let { placement_x, placement_y } = placementFromStage(
          clickPointer,
          scale_X,
          scale_Y
        );
        ({ placement_x, placement_y } = clampPlacementOrigin(
          placement_x,
          placement_y,
          this.mapController.map?.store?.map_size
        ));
        const shelfData = {
          shelf_name: `shelf_${Date.now()}`,
          template: templateKey,
          placement_x,
          placement_y,
          rotation: 0,
          modulars: [],
          flex_items: [],
          department: '',
          store_number: this.mapController.store_number,
        };
        window.createAndAddShelf(shelfData);
        this._hideMenu();
      };
    }
  }

  setupContextMenu() {
    this.mapController.layer.on('contextmenu', (e) => {
      const group = this._resolveShelfGroup(e.target);
      if (!group?.getAttr?.('shelfData')) return;
      this.handleShelfKonvaContextMenu(e, group);
    });

    this.mapController.stage.on('contentContextmenu', (e) => {
      if (this.isDraggingMap) return;

      const pointer = this.mapController.stage.getRelativePointerPosition();
      const shape = pointer
        ? this.mapController.stage.getIntersection(pointer)
        : null;
      const shelfGroup = this._resolveShelfGroup(shape);
      const isShelf = !!shelfGroup?.getAttr?.('shelfData');

      if (isShelf) {
        this.handleShelfKonvaContextMenu(e, shelfGroup);
        return;
      }

      this._showEmptyMapMenu(e, pointer);
    });

    document.addEventListener('click', () => this._hideMenu());
  }

  setupMapDrag() {
    let isRightMouseDown = false;
    let lastMousePosition = null;

    this.mapController.stage.on('mousedown', (e) => {
      if (e.evt.button === 2) {
        isRightMouseDown = true;
        lastMousePosition = this.mapController.stage.getPointerPosition();
        this.isDraggingMap = false;
      }
    });

    this.mapController.stage.on('mousemove', () => {
      if (!isRightMouseDown) return;
      const pointer = this.mapController.stage.getPointerPosition();
      if (!lastMousePosition) return;
      const dx = pointer.x - lastMousePosition.x;
      const dy = pointer.y - lastMousePosition.y;
      this.mapController.stage.position({
        x: this.mapController.stage.x() + dx,
        y: this.mapController.stage.y() + dy,
      });
      this.mapController.stage.batchDraw();
      this.isDraggingMap = true;
      lastMousePosition = pointer;
    });

    this.mapController.stage.on('mouseup', () => {
      const wasDragging = isRightMouseDown && this.isDraggingMap;
      isRightMouseDown = false;
      lastMousePosition = null;
      if (wasDragging) {
        this.mapController.stage.fire('viewportChange');
      }
    });

    this.mapController.stage.on('contentContextmenu', (e) => {
      if (this.isDraggingMap) {
        e.evt.preventDefault();
        this.isDraggingMap = false;
      }
    });
  }
}
