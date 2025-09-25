import { createStage } from '../Konva/konvaSetup.js';
import { drawStoreBoundary, drawShelf, loadShelves, drawStartingPoints } from '../Konva/drawUtils.js';
import {getStore} from '../dataUtils/storeUtils.js';
import {deleteShelf, getShelf, updateShelfById, getShelvesByStore} from '../dataUtils/shelfUtils.js';
import { ContextMenu} from './contextMenu/contextMenu.js';
import { createShelf } from '../dataUtils/shelfUtils.js';
import { GTSP_SERVER_URL } from '../../config.js';
import { walkFinder } from './pathFinder/walkFinder.js';

export class mapController {
  constructor(store_number, stage_width, stage_height, socket) {
    this.store_number = store_number;
    this.stage_width = stage_width;
    this.stage_height = stage_height;
    this.socket = socket;
  }

  
  async init() {
    // Initialize the map and get the layer
    const { contextMenu, layer, map, stage } = await this.stageMap(); // Await the stageMap method
    this.layer = layer; // Store the layer for later use
    this.stage = stage; // Store the stage for later use
    this.map = map; // Store the map data for later use
   // Expose createAndAddShelf globally for use in the context menu
    window.createAndAddShelf = this.createAndAddShelf.bind(this);
    window.deleteShelfFromMap = this.deleteShelfFromMap.bind(this);
    window.updateShelf = this.updateShelf.bind(this);
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

  // stageMap
  async stageMap() {

    const { stage, layer } = createStage('container', this.stage_width, this.stage_height);
    this.stage = stage;
    this.layer = layer;
    const map = await this.fetchMap(this.store_number);
    this.map = map;
    console.log('Fetched map');
    const {scale_X, scale_Y} = drawStoreBoundary(layer, map.store, this.stage_width, this.stage_height);
    this.scale_X = scale_X;
    this.scale_Y = scale_Y;
    console.log('Scale factors:', this.scale_X, this.scale_Y);

    // Ensure all shelves have store_number property
    map.shelves.forEach(shelf => {
      if (!shelf.store_number) {
        // throw an error and alert user about broken shelf data
        console.error('Shelf missing store_number:', shelf);
        alert(`Error: Shelf with ID ${shelf.shelf_name} is missing store_number. Please fix the shelf data.`);
      }
    });

    // load shelves from map

    loadShelves(layer, stage, map.shelves, map.store.shelf_templates, this.scale_X, this.scale_Y, this.socket);
    drawStartingPoints(layer, map.store.starting_points, this.scale_X, this.scale_Y);
    // 
    // Initialize the context menu
    const contextMenu = new ContextMenu(this);
    contextMenu.init();

    return { contextMenu, layer, map, stage};
  }

  createAndAddShelf(shelfData) {
    console.log('Creating and adding shelf:', shelfData);
    const template = this.map.store.shelf_templates[shelfData.template];

    // Add the new shelf to the shelves array
    this.map.shelves.push(shelfData);

    // Create shelf on server (async, don't block UI)
    createShelf(shelfData).catch(error => {
      console.error('Failed to save shelf to server:', error);
      // Could show user notification here
    });

    // Draw the new shelf on the canvas immediately
    console.log('Drawing new shelf with data:', shelfData, " using scale factors:", this.scale_X, this.scale_Y);
    drawShelf(this.layer, this.stage, shelfData, template, this.scale_X, this.scale_Y, this.socket);

    // Redraw the layer
    this.layer.batchDraw();
  }

  deleteShelfFromMap(shelf_name) {
    console.log('Deleting shelf with ID:', shelf_name, this.store_number);

    // Call the deleteShelf function from the dataUtils
    deleteShelf(shelf_name, this.store_number);

    // Remove the shelf from the shelves array
    this.map.shelves = this.map.shelves.filter((shelf) => shelf.shelf_name !== shelf_name);
    // Remove the shelf from the layer
    const shelf = this.layer.findOne(`#${shelf_name}`);
    if (shelf) {
      shelf.destroy();
    }
    // TODO: fix Emit deleteShelf event
    //this.socket.emit('deleteShelf', { shelf_name: shelfId });


    // Redraw the layer
    this.layer.batchDraw();
  }

  async updateShelf(shelfData) {
    console.log('Updating shelf:', shelfData);
    if (!shelfData._id) {
      console.error('Shelf _id is required for update');
      return null;
    }
    try {
      const updatedShelf = await updateShelfById(shelfData._id, shelfData);
      console.log('Shelf updated successfully:', updatedShelf);
      
      // Update the shelf in the local map data using _id
      const index = this.map.shelves.findIndex(s => s._id === shelfData._id);
      if (index !== -1) {
        console.log('Updating shelf in local map data at index:', index);
        console.log('Old shelf data:', this.map.shelves[index]);
        console.log('New shelf data:', updatedShelf);
        this.map.shelves[index] = updatedShelf;
      } else {
        console.warn('Could not find shelf in local map data to update');
      }
      // Redraw the layer to reflect changes
      this.layer.batchDraw();

      return updatedShelf;
    } catch (error) {
      console.error('Error updating shelf:', error);
      throw error;
    }
  }

 async testWalks() {
    // Implement test walks functionality
    console.log('Testing walks...');
    if (!this.walkFinder) {
      this.walkFinder = new walkFinder(this.map, GTSP_SERVER_URL);
      this.walkFinder.init();
    }
    const pickwalk = {
      itemList: [
        { upc: '0020001000011', quantity: 1 },
        { upc: '0030001000022', quantity: 2 },
      ],
    };
    console.log('Finding path for pickwalk:', pickwalk);
    this.walkFinder.findPath(this.store_number, pickwalk);
  }
}

