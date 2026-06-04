import { drawShelf } from '../../konva/drawUtils.js';

function formatModularRef(ref) {
    if (ref == null || ref === '') return '';
    if (typeof ref === 'string') return ref.trim();
    if (typeof ref === 'object') {
        if (ref.modular_id != null) return String(ref.modular_id);
        if (ref.$oid) return String(ref.$oid);
        if (ref._id != null) return String(ref._id);
    }
    const s = String(ref);
    return s === '[object Object]' ? '' : s;
}

export class ShelfEditor {
    constructor(mapController) {
        this.mapController = mapController;
        this.currentShelf = null;
        this.popup = document.getElementById('shelfEditPopup');
        this.overlay = document.getElementById('popupOverlay');
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.elements = {
            shelfId: document.getElementById('editShelfId'),
            template: document.getElementById('editTemplate'),
            rotation: document.getElementById('editRotation'),
            modulars: document.getElementById('editModulars'),
            department: document.getElementById('editDepartment'),
            saveBtn: document.getElementById('saveEditShelf'),
            cancelBtn: document.getElementById('cancelEditShelf')
        };
    }

    setupEventListeners() {
        this.elements.saveBtn.addEventListener('click', () => this.saveShelf());
        this.elements.cancelBtn.addEventListener('click', () => this.closePopup());
        this.overlay.addEventListener('click', () => this.closePopup());
        
        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.popup.style.display !== 'none') {
                this.closePopup();
            }
        });
    }

    populateTemplateDropdown() {
        const templateSelect = this.elements.template;
        templateSelect.innerHTML = '';
        
        Object.entries(this.mapController.map.store.shelf_templates).forEach(([id, template]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = template.name || id;
            templateSelect.appendChild(option);
        });
    }

    openEditor(shelfData) {
        if (!shelfData) {
            console.error('Cannot open shelf editor: shelf data is undefined');
            alert('Error: Could not load shelf data. Please try again.');
            return;
        }
        
        this.currentShelf = shelfData;
        this.populateTemplateDropdown();
        
        // Populate form with current shelf data
        this.elements.shelfId.value = shelfData.shelf_name || '';
        this.elements.template.value = shelfData.template || '';
        this.elements.rotation.value = shelfData.rotation || 0;
        const modularDisplay = (shelfData.modulars || [])
            .map(formatModularRef)
            .filter(Boolean);
        this.elements.modulars.value = modularDisplay.join(', ');
        this.elements.department.value = shelfData.department || '';
        
        // Show popup
        this.overlay.style.display = 'block';
        this.popup.style.display = 'block';
        this.elements.shelfId.focus();
    }

    closePopup() {
        this.overlay.style.display = 'none';
        this.popup.style.display = 'none';
        this.currentShelf = null;
    }

    async saveShelf() {
        if (!this.currentShelf) return;

        const oldShelfId = this.currentShelf.shelf_name;
        
        // Get updated values from form
        const updatedShelf = {
            ...this.currentShelf,
            shelf_name: this.elements.shelfId.value.trim(),
            template: this.elements.template.value,
            rotation: parseInt(this.elements.rotation.value) || 0,
            modulars: this.elements.modulars.value.split(',').map(m => m.trim()).filter(m => m),
            department: this.elements.department.value.trim(),
            store_number: this.mapController.store_number
        };

        try {
            // Use mapController's updateShelf method with the OLD shelf name to find it
            const updatedShelfFromServer = await this.mapController.updateShelf(oldShelfId, updatedShelf);

            const sync = updatedShelfFromServer?.itemIndexesSynced;
            if (sync?.modularsMissing?.length) {
                alert(
                    `Shelf saved but these modular refs could not be resolved (pathfinder may use old locations): ${sync.modularsMissing.join(', ')}`
                );
            }

            this.closePopup();

            console.log('Shelf updated successfully by recreating:', updatedShelfFromServer);
        } catch (error) {
            console.error('Failed to update shelf:', error);
            alert('Failed to save shelf changes. Please try again.');
        }
    }
}