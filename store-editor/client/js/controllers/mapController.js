import { createStage } from '../konva/konvaSetup.js';
import {
  computeMapScale,
  computeStagePixelSize,
  drawStoreEdge,
  drawShelf,
  loadShelves,
  drawStartingPoints,
  drawFootGrid,
  clearMapShelfLayer,
} from '../konva/drawUtils.js';
import {getStore} from '../dataUtils/storeUtils.js';
import {deleteShelf, updateShelfByOldName, getShelvesByStore} from '../dataUtils/shelfUtils.js';
import { ContextMenu} from './contextMenu/contextMenu.js';
import { createShelf, cloneShelf } from '../dataUtils/shelfUtils.js';
import { GTSP_SERVER_URL } from '../../config.js';
import { walkFinder } from './pathFinder/walkFinder.js';
import { PathOverlay } from './pathFinder/pathOverlay.js';
import { PathResultsPopup } from './pathFinder/pathResultsPopup.js';

export class mapController {
  constructor(store_number, stage_width, stage_height, socket) {
    this.store_number = store_number;
    this.stage_width = stage_width;
    this.stage_height = stage_height;
    this.socket = socket;
    this.palette = null;
  }

  
  async init() {
    // Initialize the map and get the layer
    const { contextMenu, layer, map, stage } = await this.stageMap(); // Await the stageMap method
    this.layer = layer; // Store the layer for later use
    this.stage = stage; // Store the stage for later use
    this.map = map; // Store the map data for later use
   // Expose createAndAddShelf globally for use in the context menu
    window.createAndAddShelf = this.createAndAddShelf.bind(this);
    window.cloneAndAddShelf = this.cloneAndAddShelf.bind(this);
    window.deleteShelfFromMap = this.deleteShelfFromMap.bind(this);
    window.updateShelf = this.updateShelf.bind(this);
    this._bindResizeObserver();
    // TODO: finish auto update functionality
    // Listen for updates from other clients
    /*this.socket.on('updateShelf', (data) => {
      // Ignore updates from the same client
      if (data.senderId === this.socket.id) {
          console.log(`Ignoring self-emitted update for shelf ID ${data._id}`);
          return;
      }
      const shelf = this.layer.findOne(`#${data.shelf_name}`);
      if (shelf) {
        shelfData = this.map.shelves[data.shelf_name];
        moveShelf(shelfData, data.x, data.y);
        this.layer.draw();
      } else {
        console.warn(`Updated shelf with ID ${data.id} not found`);
      }
    });
    */
  }

  // fetch and collect map data
  async fetchMap(store_number) {
    let store = await getStore(store_number);
    
    let shelves = await getShelvesByStore(store_number);
    console.log('Fetched store and shelves:', store, shelves);
    return { store, shelves };
  }

  _getContainerMaxSize() {
    const el = document.getElementById('container');
    const rect = el?.getBoundingClientRect();
    const topbar =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--topbar-height'),
        10
      ) || 48;
    return {
      maxWidth: Math.max(200, Math.floor(rect?.width || window.innerWidth)),
      maxHeight: Math.max(
        200,
        Math.floor(rect?.height || window.innerHeight - topbar)
      ),
    };
  }

  _applyStagePixelSize(store) {
    const { maxWidth, maxHeight } = this._getContainerMaxSize();
    const { width, height } = computeStagePixelSize(
      store.map_size,
      maxWidth,
      maxHeight
    );
    this.stage_width = width;
    this.stage_height = height;
    if (this.stage) {
      this.stage.width(width);
      this.stage.height(height);
    }
    return { width, height };
  }

  redrawMapLayout() {
    if (!this.stage || !this.map?.store) return;

    this._applyStagePixelSize(this.map.store);
    const { scale_X, scale_Y } = computeMapScale(
      this.map.store,
      this.stage_width,
      this.stage_height
    );
    this.scale_X = scale_X;
    this.scale_Y = scale_Y;

    const spacingFt = this.map.store.grid_spacing_ft ?? 100;
    if (this.gridLayer) {
      drawFootGrid(this.gridLayer, this.map.store, scale_X, scale_Y, spacingFt);
    }
    if (this.boundaryLayer) {
      drawStoreEdge(this.boundaryLayer, this.map.store, scale_X, scale_Y);
    }
    clearMapShelfLayer(this.layer);
    loadShelves(
      this.layer,
      this.stage,
      this.map.shelves,
      this.map.store.shelf_templates,
      scale_X,
      scale_Y,
      this.socket
    );
    drawStartingPoints(
      this.layer,
      this.map.store.starting_points || [],
      scale_X,
      scale_Y
    );
    if (this.palette) {
      this.palette.updateScales(scale_X, scale_Y);
    }
    this.stage.batchDraw();
  }

  _bindResizeObserver() {
    const container = document.getElementById('container');
    if (!container || typeof ResizeObserver === 'undefined') return;

    let resizeTimer;
    this._resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.redrawMapLayout(), 150);
    });
    this._resizeObserver.observe(container);
  }

  // stageMap
  async stageMap() {
    const map = await this.fetchMap(this.store_number);
    this.map = map;
    this.templates = map.store.shelf_templates;

    const { maxWidth, maxHeight } = this._getContainerMaxSize();
    const { width, height } = computeStagePixelSize(
      map.store.map_size,
      maxWidth,
      maxHeight
    );
    this.stage_width = width;
    this.stage_height = height;

    const { stage, layer } = createStage('container', width, height);
    this.stage = stage;
    this.layer = layer;

    const gridLayer = new Konva.Layer({ name: 'foot-grid' });
    stage.add(gridLayer);
    gridLayer.moveToBottom();

    const boundaryLayer = new Konva.Layer({ name: 'store-edge' });
    stage.add(boundaryLayer);
    boundaryLayer.moveUp();

    const { scale_X, scale_Y } = computeMapScale(
      map.store,
      this.stage_width,
      this.stage_height
    );
    this.scale_X = scale_X;
    this.scale_Y = scale_Y;

    const spacingFt = map.store.grid_spacing_ft ?? 100;
    drawFootGrid(gridLayer, map.store, scale_X, scale_Y, spacingFt);
    this.gridLayer = gridLayer;

    drawStoreEdge(boundaryLayer, map.store, scale_X, scale_Y);
    this.boundaryLayer = boundaryLayer;
    layer.moveToTop();

    map.shelves.forEach((shelf) => {
      if (!shelf.store_number) {
        console.error('Shelf missing store_number:', shelf);
        alert(
          `Error: Shelf with ID ${shelf.shelf_name} is missing store_number. Please fix the shelf data.`
        );
      }
    });

    loadShelves(
      layer,
      stage,
      map.shelves,
      map.store.shelf_templates,
      this.scale_X,
      this.scale_Y,
      this.socket
    );
    drawStartingPoints(layer, map.store.starting_points || [], scale_X, scale_Y);
    // 
    // Initialize the context menu
    const contextMenu = new ContextMenu(this);
    contextMenu.init();

    this.pathOverlay = new PathOverlay(stage);
    this.pathResultsPopup = new PathResultsPopup(() => this.pathOverlay.clear());
    this.walkFinder = new walkFinder(GTSP_SERVER_URL);

    return { contextMenu, layer, map, stage};
  }

  async createAndAddShelf(shelfData) {
    console.log('Creating and adding shelf:', shelfData);
    const saved = await createShelf(shelfData);
    Object.assign(shelfData, saved);
    this._drawShelfOnMap(shelfData);
    return shelfData;
  }

  async cloneAndAddShelf(sourceShelfName, clonedShelfData) {
    console.log('Cloning shelf from', sourceShelfName, clonedShelfData);
    const { shelf, itemIndexesUpdated, itemIndexesSynced } = await cloneShelf(
      sourceShelfName,
      clonedShelfData
    );
    const shelfData = shelf.toObject ? shelf.toObject() : shelf;
    this._drawShelfOnMap(shelfData);
    const synced = itemIndexesSynced?.indexesUpdated ?? itemIndexesSynced;
    console.log(
      `Cloned shelf ${shelfData.shelf_name}; itemindexes: duplicated=${itemIndexesUpdated}, synced=${JSON.stringify(itemIndexesSynced)}`
    );
    if (itemIndexesSynced?.modularsMissing?.length) {
      console.warn('Some modulars on shelf could not be resolved:', itemIndexesSynced.modularsMissing);
      alert(
        `Clone created but modular refs could not sync to itemindexes: ${itemIndexesSynced.modularsMissing.join(', ')}. Edit shelf modulars using modular_id (e.g. 203) and save again.`
      );
    } else if (itemIndexesSynced?.modularsResolved?.length) {
      console.log(
        `Itemindex sync OK (${itemIndexesSynced.modularsResolved.join(', ')}). Test Walks routes to the nearest shelf with those modulars—move the clone or clear modulars on the original to change picks.`
      );
    }
    return shelfData;
  }

  _drawShelfOnMap(shelfData) {
    const template = this.map.store.shelf_templates[shelfData.template];
    if (!this.map.shelves.includes(shelfData)) {
      this.map.shelves.push(shelfData);
    }
    drawShelf(
      this.layer,
      this.stage,
      shelfData,
      template,
      this.scale_X,
      this.scale_Y,
      this.socket
    );
    this.layer.batchDraw();
  }

  deleteShelfFromMap(shelfName) {
    console.log('Deleting shelf with ID:', shelfName, this.store_number);

    // Call the deleteShelf function from the dataUtils
    deleteShelf(shelfName, this.store_number);

    // Remove the shelf from the shelves array
    this.map.shelves = this.map.shelves.filter((shelf) => shelf.shelf_name !== shelfName);
    
    // Remove the shelf from the layer - try different approaches
    let shelf = this.layer.findOne(`#${shelfName}`);
    
    if (shelf) {
      console.log('Destroying shelf:', shelf.id());
      
      shelf.destroy();
      
      // Also clean up any associated elements (tooltips, etc.)
      this.layer.find(node => {
        return node.getAttr && node.getAttr('shelfId') === shelfName;
      });
      
    
    } else {
      console.warn('Could not find shelf to delete:', shelfName);
    }
    
    // TODO: fix Emit deleteShelf event
    //this.socket.emit('deleteShelf', { shelf_name: shelfName });

    // Redraw the layer
    this.layer.batchDraw();
  }

  async updateShelf(oldShelfName, updatedShelfData) {
    console.log('Updating shelf:', oldShelfName, 'with new data:', updatedShelfData);
    
    try {
      // First, find the shelf in local map data BEFORE making server request
      const index = this.map.shelves.findIndex(s => s.shelf_name === oldShelfName);
      console.log('Found shelf in local map data at index:', index);
      
      if (index === -1) {
        console.warn('Could not find shelf in local map data:', oldShelfName);
        console.log('Available shelves:', this.map.shelves.map(s => s.shelf_name));
      }
      
      // Use the shelf_name/store_number route with the OLD name to find the shelf
      const updatedShelf = await updateShelfByOldName(oldShelfName, updatedShelfData, this.store_number);
      console.log('Shelf updated successfully:', updatedShelf);
      
      // Remove the shelf from the shelves array
    this.map.shelves = this.map.shelves.filter((shelf) => shelf.shelf_name !== oldShelfName);
    
    // Remove the shelf from the layer - try different approaches
    let shelf = this.layer.findOne(`#${oldShelfName}`);

    if (shelf) {
      console.log('Destroying shelf:', shelf.id());
      
      shelf.destroy();
      
      // Also clean up any associated elements (tooltips, etc.)
      this.layer.find(node => {
        return node.getAttr && node.getAttr('shelfId') === oldShelfName;
      });
      
    
    } else {
      console.warn('Could not find shelf to delete:', oldShelfName);
    }
      
      // Add the updated shelf back to the array
      this.map.shelves.push(updatedShelf);
      //get template from the store data
      const template = this.map.store.shelf_templates[updatedShelfData.template];

      // Draw the updated shelf with the new name
      drawShelf(this.layer, this.stage, updatedShelf, template, this.scale_X, this.scale_Y, this.socket);
      
      // Redraw the layer to reflect changes
      this.layer.batchDraw();

      return updatedShelf;
    } catch (error) {
      console.error('Error updating shelf:', error);
      throw error;
    }
  }

  async testWalks() {
    const btn = document.getElementById('testWalksBtn');
    const originalLabel = btn.textContent;
    console.log('Testing walks...');

    const pickwalk = {
      starting_point: { id: 'Main_Entrance', point: [10, 50] },
      itemList: [
        { upc: '0020001000011', quantity: 1 },
        { upc: '0030001000022', quantity: 2 },
      ],
    };
    console.log('Finding path for pickwalk:', pickwalk);

    try {
      btn.disabled = true;
      btn.textContent = 'Finding path…';
      this.pathOverlay.clear();

      const { result, startPoint, endPoint } = await this.walkFinder.findPath(
        this.store_number,
        pickwalk
      );

      this.pathOverlay.drawRoute(this.scale_X, this.scale_Y, startPoint, result);
      this.pathResultsPopup.showSuccess(pickwalk, result, startPoint, endPoint);
    } catch (error) {
      console.error('Error finding path:', error);
      this.pathResultsPopup.showError(
        error.message || 'Failed to find path. Is gtsp-server running?'
      );
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
}

