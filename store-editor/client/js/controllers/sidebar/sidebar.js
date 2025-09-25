export class Sidebar {
  constructor(stage, templates, store_number) {
    this.stage = stage;
    this.templates = templates;
    this.store_number = store_number;
    this.sidebarEl = document.getElementById('sidebar');
    this.shelfTemplatesDiv = document.getElementById('shelfTemplates');
    this.toggleBtn = document.getElementById('toggleSidebar');
    this.contextMenu = document.getElementById('contextMenu');
    this.newShelfInput = document.getElementById('newShelfName');
    this.addShelfBtn = document.getElementById('addShelfBtn');

    this.init();
  }

  init() {
    this.populateTemplates();
    this.setupToggle();
    this.setupDragAndDrop();
  }

  populateTemplates() {
    this.shelfTemplatesDiv.innerHTML = '';
    Object.entries(this.templates).forEach(([id, template]) => {
      const div = document.createElement('div');
      div.textContent = template.name || id;
      div.style.padding = '5px';
      div.style.border = '1px solid #999';
      div.style.marginBottom = '5px';
      div.style.cursor = 'grab';
      div.draggable = true;

      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('templateId', id);
      });

      this.shelfTemplatesDiv.appendChild(div);
    });
  }

  setupToggle() {
    this.toggleBtn.addEventListener('click', () => {
      this.sidebarEl.classList.toggle('collapsed');
    });
  }

  setupDragAndDrop() {
    const container = this.stage.container();
    container.addEventListener('dragover', (e) => e.preventDefault());
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const templateId = e.dataTransfer.getData('templateId');
      if (!templateId) return;

      const template = this.templates[templateId];
      if (!template) return;

      const mousePos = this.stage.getPointerPosition();
      
      // Get scale factors from the mapController via global reference
      const mapCtrl = window.mapController; // We'll need to set this global reference
      if (!mapCtrl) {
        console.error('Map controller not available');
        return;
      }
      
      const newShelf = {
        shelf_id: `shelf_${Date.now()}`,
        placement_x: Math.round(mousePos.x / mapCtrl.scale_X / 10) * 10, // Convert to original coords and snap to 10-unit grid
        placement_y: Math.round(mousePos.y / mapCtrl.scale_Y / 10) * 10, // Convert to original coords and snap to 10-unit grid
        rotation: 0,
        modulars: [],
        flex_items: [],
        template: templateId,
        store_number: this.store_number,
      };

      window.createAndAddShelf(newShelf, template);
    });
  }


}
