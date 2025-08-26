export class ContextMenu {
  constructor(stage, templates, layer) {
    this.stage = stage;
    this.templates = templates;
    this.layer = layer;
    this.contextMenu = document.getElementById('contextMenu');
    this.addShelfBtn = document.getElementById('addShelfBtn');
    this.newShelfInput = document.getElementById('newShelfName');
    this.deleteShelfBtn = document.getElementById('deleteShelfBtn');
    this.cloneShelfBtn = document.getElementById('cloneShelfBtn');
    this.currentShelfNode = null;
  }

  init() {
    this.setupContextMenu();
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

        // Show shelf actions, hide add
        this.addShelfBtn.style.display = 'none';
        this.deleteShelfBtn.style.display = '';
        this.cloneShelfBtn.style.display = '';
        this.newShelfInput.value = target.id();
        this.currentShelfNode = target;

        // Edit shelf name
        this.addShelfBtn.onclick = null; // Disable add
        this.deleteShelfBtn.onclick = () => {
          target.destroy();
          this.layer.draw();
          this.contextMenu.style.display = 'none';
        };
        this.cloneShelfBtn.onclick = () => {
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
        this.newShelfInput.onchange = () => {
          target.id(this.newShelfInput.value);
          this.layer.draw();
        };
      }
    });

    // Right-click on empty space (stage)
    this.stage.on('contentContextmenu', (e) => {
      // Only show if not clicking a shelf
      const pointer = this.stage.getPointerPosition();
      const shape = this.stage.getIntersection(pointer);
      if (!shape) {
        e.preventDefault();
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = pointer.x + 'px';
        this.contextMenu.style.top = pointer.y + 'px';

        // Show add, hide shelf actions
        this.addShelfBtn.style.display = '';
        this.deleteShelfBtn.style.display = 'none';
        this.cloneShelfBtn.style.display = 'none';
        this.newShelfInput.value = '';
        this.currentShelfNode = null;

        this.addShelfBtn.onclick = () => {
          // Pick a default template
          const templateKey = Object.keys(this.templates)[0];
          const template = this.templates[templateKey];
          const shelfData = {
            id: `shelf_${Date.now()}`,
            template: templateKey,
            placement: [
              Math.round(pointer.x / scaleX),
              Math.round(pointer.y / scaleY)
            ],
            rotation: 0,
            modulars: [],
            flex_items: [],
            department: ''
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
}