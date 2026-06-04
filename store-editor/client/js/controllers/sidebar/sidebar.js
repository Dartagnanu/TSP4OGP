export class Sidebar {
  constructor() {
    this.sidebarEl = document.getElementById('sidebar');
    this.toggleBtn = document.getElementById('toggleSidebar');
    this.setupToggle();
  }

  setupToggle() {
    this.toggleBtn.addEventListener('click', () => {
      this.sidebarEl.classList.toggle('collapsed');
    });
  }
}
