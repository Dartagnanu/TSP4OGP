import { ShelfEditor } from './shelfEditor.js';
import {
  placementFromStage,
  clampPlacementOrigin,
} from '../../konva/mapUnits.js';

export class ContextMenu {
  constructor(mapController) {
    this.mapController = mapController; // store instance of mapController
    this.contextMenu = document.getElementById('contextMenu');
    this.addShelfBtn = document.getElementById('addShelfBtn');
    this.deleteShelfBtn = document.getElementById('deleteShelfBtn');
    this.cloneShelfBtn = document.getElementById('cloneShelfBtn');
    this.editShelfBtn = document.getElementById('editShelfBtn');
    this.currentShelfNode = null;
    this.isDraggingMap = false; // Track if the map is being dragged
    
    // Initialize the shelf editor
    this.shelfEditor = new ShelfEditor(mapController);
  }

  init() {
    this.setupContextMenu();
    this.setupMapDrag();
  }
  setupContextMenu() {
    // Right-click on shelves
    this.mapController.layer.on('contextmenu', (e) => {
      const target = e.target;
      if (target && target.id()) {
        e.evt.preventDefault();
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = e.evt.clientX + 'px';
        this.contextMenu.style.top = e.evt.clientY + 'px';

        // Find the shelf data using the target's ID - now get it from the group
        const shelfId = target.id();
        let shelfData = null;
        
        // If target is the group itself, get data directly
        if (target.getAttr && target.getAttr('shelfData')) {
          shelfData = target.getAttr('shelfData');
        } 
        // If target is a child of a group, get data from parent
        else if (target.parent && target.parent.getAttr && target.parent.getAttr('shelfData')) {
          shelfData = target.parent.getAttr('shelfData');
        }
        // Fallback: search for the shelf group by ID
        else {
          const shelfGroup = this.mapController.layer.findOne(`#${shelfId}`);
          if (shelfGroup && shelfGroup.getAttr('shelfData')) {
            shelfData = shelfGroup.getAttr('shelfData');
          }
        }
        
        console.log('Right-clicked on shelf:', shelfData);

        // Check if shelf data was found
        if (!shelfData) {
          console.warn('Could not find shelf data for ID:', shelfId);
          this.contextMenu.style.display = 'none';
          return;
        }

        // Show shelf actions, hide add
        this.addShelfBtn.style.display = 'none';
        this.deleteShelfBtn.style.display = '';
        this.cloneShelfBtn.style.display = '';
        this.currentShelfNode = target;

        // Edit shelf name
        this.editShelfBtn.onclick = () => {
          console.log("edit shelf button clicked");
          this.shelfEditor.openEditor(shelfData);
          this.contextMenu.style.display = 'none';
        };

        this.addShelfBtn.onclick = () => {
          console.log("add shelf button clicked");
        };
        this.deleteShelfBtn.onclick = () => {
          console.log("delete shelf button clicked");
          window.deleteShelfFromMap(shelfData.shelf_name);
        };
        this.cloneShelfBtn.onclick = async () => {
          console.log('clone shelf button clicked');

          const clonedShelfData = {
            store_number: shelfData.store_number ?? this.mapController.store_number,
            shelf_name: `${shelfData.shelf_name}_copy_${Date.now()}`,
            template: shelfData.template,
            placement_x: shelfData.placement_x + 10,
            placement_y: shelfData.placement_y + 10,
            rotation: shelfData.rotation ?? 0,
            modulars: shelfData.modulars ?? [],
            flex_items: shelfData.flex_items ?? [],
            department: shelfData.department ?? '',
          };

          try {
            const created = await this.mapController.cloneAndAddShelf(
              shelfData.shelf_name,
              clonedShelfData
            );
            console.log(
              'Clone complete:',
              created.shelf_name,
              '— pathfinder picks the nearest shelf with shared modulars (see itemIndexesSynced in Network tab).'
            );
          } catch (err) {
            console.error('Failed to clone shelf:', err);
            alert(err.message || 'Failed to clone shelf');
          }

          this.contextMenu.style.display = 'none';
        };
    
      }
    });

    // Right-click on empty space (stage)
    this.mapController.stage.on('contentContextmenu', (e) => {
      if (this.isDraggingMap) return; // Prevent context menu if dragging the map

      const pointer = this.mapController.stage.getRelativePointerPosition();
      const shape = pointer
        ? this.mapController.stage.getIntersection(pointer)
        : null;
      if (!shape) {
        e.evt.preventDefault();
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = e.evt.clientX + 'px';
        this.contextMenu.style.top = e.evt.clientY + 'px';

        // Show add, hide shelf actions
        this.addShelfBtn.style.display = '';
        this.deleteShelfBtn.style.display = 'none';
        this.cloneShelfBtn.style.display = 'none';
        this.currentShelfNode = null;

        this.addShelfBtn.onclick = () => {
          const templates = this.mapController.map.store.shelf_templates;
          const templateKey = Object.keys(templates)[0];
          const clickPointer = this.mapController.stage.getRelativePointerPosition();
          if (!clickPointer) {
            console.error('Could not resolve click position on stage');
            return;
          }
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
          this.contextMenu.style.display = 'none';
        };
      }
    });

    // Hide menu on click elsewhere
    document.addEventListener('click', () => {
      this.contextMenu.style.display = 'none';
    });
  }

  setupMapDrag() {
    let isRightMouseDown = false;
    let lastMousePosition = null;

    // Detect right mouse button down
    this.mapController.stage.on('mousedown', (e) => {
      if (e.evt.button === 2) { // Right mouse button
        isRightMouseDown = true;
        lastMousePosition = this.mapController.stage.getPointerPosition();
        this.isDraggingMap = false; // Reset dragging flag
      }
    });

    // Handle mouse move for dragging
    this.mapController.stage.on('mousemove', (e) => {
      if (isRightMouseDown) {
        const pointer = this.mapController.stage.getPointerPosition();
        if (lastMousePosition) {
          const dx = pointer.x - lastMousePosition.x;
          const dy = pointer.y - lastMousePosition.y;

          // Move the stage
          const newPos = {
            x: this.mapController.stage.x() + dx,
            y: this.mapController.stage.y() + dy,
          };
          this.mapController.stage.position(newPos);
          this.mapController.stage.batchDraw();

          this.isDraggingMap = true; // Set dragging flag
        }
        lastMousePosition = pointer;
      }
    });

    // Detect right mouse button up
    this.mapController.stage.on('mouseup', () => {
      isRightMouseDown = false;
      lastMousePosition = null;
    });

    // Prevent context menu if dragging
    this.mapController.stage.on('contentContextmenu', (e) => {
      if (this.isDraggingMap) {
        e.evt.preventDefault();
        this.isDraggingMap = false; // Reset dragging flag
      }
    });
  }
}