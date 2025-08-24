export class Sidebar {
  constructor(stage, templates) {
    this.stage = stage;
    this.templates = templates;
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
    this.setupContextMenu();
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
      if (this.sidebarEl.style.width === '0px') {
        this.sidebarEl.style.width = '200px';
        document.getElementById('container').style.marginLeft = '200px';
      } else {
        this.sidebarEl.style.width = '0px';
        document.getElementById('container').style.marginLeft = '0px';
      }
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
      const newShelf = {
        id: `shelf_${Date.now()}`,
        placement: [Math.round(mousePos.x / window.scaleX), Math.round(mousePos.y / window.scaleY)],
        modulars: [],
        flex_items: [],
        template: templateId,
      };

      window.addShelf(newShelf, template); // assumes addShelf is global
    });
  }

  setupContextMenu() {
    this.stage.on('contextmenu', (e) => {
      e.evt.preventDefault();
      this.contextMenu.style.display = 'block';
      this.contextMenu.style.left = e.evt.clientX + 'px';
      this.contextMenu.style.top = e.evt.clientY + 'px';

      this.addShelfBtn.onclick = () => {
        const shelfId = this.newShelfInput.value || `shelf_${Date.now()}`;
        const template = Object.values(this.templates)[0]; // default template

        const newShelf = {
          id: shelfId,
          placement: [Math.round(e.evt.layerX / window.scaleX), Math.round(e.evt.layerY / window.scaleY)],
          modulars: [],
          flex_items: [],
          template: template ? template.id : 'default',
        };

        window.addShelf(newShelf, template);
        this.contextMenu.style.display = 'none';
      };
    });

    document.addEventListener('click', () => {
      this.contextMenu.style.display = 'none';
    });
  }
}
