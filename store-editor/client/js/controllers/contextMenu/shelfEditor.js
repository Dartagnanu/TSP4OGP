import { updateShelf } from '../../dataUtils/shelfUtils.js';
import { drawShelf } from '../../konva/drawUtils.js';

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
        this.elements.modulars.value = (shelfData.modulars || []).join(', ');
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
            // Update shelf data in the map
            const shelfIndex = this.mapController.map.shelves.findIndex(s => s.shelf_name === oldShelfId);
            if (shelfIndex !== -1) {
                this.mapController.map.shelves[shelfIndex] = updatedShelf;
            }

            // Use mapController's updateShelf method with the OLD shelf name to find it
            await this.mapController.updateShelf(oldShelfId, updatedShelf);

            // If shelf name changed, we need to update the visual element ID
            const shelfElement = this.mapController.layer.findOne(`#${oldShelfId}`);
            if (shelfElement && updatedShelf.shelf_name !== oldShelfId) {
                // Check if it's a group or individual element
                if (shelfElement.parent && shelfElement.parent.nodeType === 'Group') {
                    // If the element is inside a group, update the group's ID
                    shelfElement.parent.id(updatedShelf.shelf_name);
                } else {
                    // If it's a direct element, update its ID
                    shelfElement.id(updatedShelf.shelf_name);
                }
            }

            // If template or rotation changed, redraw the shelf
            if (updatedShelf.template !== this.currentShelf.template || 
                updatedShelf.rotation !== this.currentShelf.rotation) {
                this.redrawShelf(oldShelfId, updatedShelf);
            }

            // Update the shelf name text using mapController
            if (updatedShelf.shelf_name !== oldShelfId) {
                this.updateShelfNameText(oldShelfId, updatedShelf.shelf_name);
            }

            this.mapController.layer.batchDraw();
            this.closePopup();

            console.log('Shelf updated successfully:', updatedShelf);
        } catch (error) {
            console.error('Failed to update shelf:', error);
            alert('Failed to save shelf changes. Please try again.');
        }
    }

    redrawShelf(oldShelfId, updatedShelf) {
        // Remove old shelf visual
        const oldShelfElement = this.mapController.layer.findOne(`#${oldShelfId}`);
        if (oldShelfElement) {
            oldShelfElement.destroy();
        }

        // Draw new shelf with updated properties
        const template = this.mapController.map.store.shelf_templates[updatedShelf.template];
        if (template) {
            drawShelf(
                this.mapController.layer, 
                this.mapController.stage, 
                updatedShelf, 
                template, 
                this.mapController.scale_X, 
                this.mapController.scale_Y, 
                this.mapController.socket
            );
        }
    }

    updateShelfNameText(oldShelfId, newShelfId) {
        // Try to find the shelf group first
        let shelfGroup = this.mapController.layer.findOne(`#${oldShelfId}`);
        
        // If not found, try with the new ID
        if (!shelfGroup) {
            shelfGroup = this.mapController.layer.findOne(`#${newShelfId}`);
        }
        
        if (shelfGroup && newShelfId !== oldShelfId) {
            // If we found an element, check if it's a group or if its parent is a group
            let groupToSearch = null;
            
            if (shelfGroup.nodeType === 'Group') {
                groupToSearch = shelfGroup;
            } else if (shelfGroup.parent && shelfGroup.parent.nodeType === 'Group') {
                groupToSearch = shelfGroup.parent;
            }
            
            if (groupToSearch && typeof groupToSearch.find === 'function') {
                const textElement = groupToSearch.find('Text')[0];
                if (textElement) {
                    textElement.text(newShelfId);
                    console.log('Updated shelf name text to:', newShelfId);
                }
            } else {
                console.warn('Could not find group to update shelf text:', shelfGroup);
            }
        }
    }
}