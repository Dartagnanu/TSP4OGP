export class ContextMenu {
  constructor(stage, templates, layer, shelves) {
    this.stage = stage;
    this.shelves = shelves;
    this.templates = templates;
    this.layer = layer;
    this.contextMenu = document.getElementById('contextMenu');
    this.addShelfBtn = document.getElementById('addShelfBtn');
    this.deleteShelfBtn = document.getElementById('deleteShelfBtn');
    this.cloneShelfBtn = document.getElementById('cloneShelfBtn');
    this.editShelfBtn = document.getElementById('editShelfBtn');
    this.currentShelfNode = null;
    this.isDraggingMap = false; // Track if the map is being dragged
  }

  init() {
    this.setupContextMenu();
    this.setupMapDrag();
  }

  setupContextMenu() {
    // Right-click on shelves
    this.layer.on('contextmenu', (e) => {
      const target = e.target;
      if (target && target.id()) {
        e.evt.preventDefault();
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = e.evt.clientX + 'px';
        this.contextMenu.style.top = e.evt.clientY + 'px';

        // Find the shelf data using the target's ID
        const shelfId = target.id();
        const shelfData = this.shelves.find((shelf) => shelf.shelf_id === shelfId);
        console.log('Right-clicked on shelf:', shelfData);

        // Show shelf actions, hide add
        this.addShelfBtn.style.display = 'none';
        this.deleteShelfBtn.style.display = '';
        this.cloneShelfBtn.style.display = '';
        this.currentShelfNode = target;

        // Edit shelf name
        this.editShelfBtn.onclick = () => {
          console.log("edit shelf button clicked");
          const newName = prompt("Enter new shelf name:", target.attrs.name);
          if (newName) {
            target.setAttrs({ name: newName });
            this.layer.draw();
          }
          this.contextMenu.style.display = 'none';
        };

        this.addShelfBtn.onclick = () => {
          console.log("add shelf button clicked");
        };
        this.deleteShelfBtn.onclick = () => {
          console.log("delete shelf button clicked");
          target.destroy();
          this.layer.draw();
          this.contextMenu.style.display = 'none';
        };
        this.cloneShelfBtn.onclick = () => {
          console.log("clone shelf button clicked");
          const shelfData = {
            ...target.attrs,
            id: `shelf_${Date.now()}`,
            x: target.x() + 20,
            y: target.y() + 20,
          };
          const template = this.templates[shelfData.template] || Object.values(this.templates)[0];
          window.createAndAddShelf(shelfData, template);
          this.contextMenu.style.display = 'none';
        };
    
      }
    });

    // Right-click on empty space (stage)
    this.stage.on('contentContextmenu', (e) => {
      if (this.isDraggingMap) return; // Prevent context menu if dragging the map

      const pointer = this.stage.getPointerPosition();
      const shape = this.stage.getIntersection(pointer);
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
          // Pick a default template
          const templateKey = Object.keys(this.templates)[0];
          const template = this.templates[templateKey];
          const shelfData = {
            id: `shelf_${Date.now()}`,
            template: templateKey,
            placement_x: Math.round(pointer.x / 20), // Adjust grid size as needed
            placement_y: Math.round(pointer.y / 20),
            rotation: 0,
            modulars: [],
            flex_items: [],
            department: '',
          };
          window.createAndAddShelf(shelfData, template);
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
    this.stage.on('mousedown', (e) => {
      if (e.evt.button === 2) { // Right mouse button
        isRightMouseDown = true;
        lastMousePosition = this.stage.getPointerPosition();
        this.isDraggingMap = false; // Reset dragging flag
      }
    });

    // Handle mouse move for dragging
    this.stage.on('mousemove', (e) => {
      if (isRightMouseDown) {
        const pointer = this.stage.getPointerPosition();
        if (lastMousePosition) {
          const dx = pointer.x - lastMousePosition.x;
          const dy = pointer.y - lastMousePosition.y;

          // Move the stage
          const newPos = {
            x: this.stage.x() + dx,
            y: this.stage.y() + dy,
          };
          this.stage.position(newPos);
          this.stage.batchDraw();

          this.isDraggingMap = true; // Set dragging flag
        }
        lastMousePosition = pointer;
      }
    });

    // Detect right mouse button up
    this.stage.on('mouseup', () => {
      isRightMouseDown = false;
      lastMousePosition = null;
    });

    // Prevent context menu if dragging
    this.stage.on('contentContextmenu', (e) => {
      if (this.isDraggingMap) {
        e.evt.preventDefault();
        this.isDraggingMap = false; // Reset dragging flag
      }
    });
  }
}