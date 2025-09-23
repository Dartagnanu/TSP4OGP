import { createStage } from '../Konva/konvaSetup.js';
import { drawStoreBoundary, drawShelf, loadShelves, drawStartingPoints } from '../Konva/drawUtils.js';
import {getStore} from '../dataUtils/storeUtils.js';
import {deleteShelf, getShelf, getShelvesByStore} from '../dataUtils/shelfUtils.js';
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

    // TODO: finish auto update functionality
    // Listen for updates from other clients
    /*this.socket.on('updateShelf', (data) => {
      // Ignore updates from the same client
      if (data.senderId === this.socket.id) {
          console.log(`Ignoring self-emitted update for shelf ID ${data.id}`);
          return;
      }
      const shelf = this.layer.findOne(`#${data.shelf_id}`);
      if (shelf) {
        shelfData = this.map.shelves[data.shelf_id];
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

    createShelf(shelfData);

    // Draw the new shelf on the canvas
    console.log('Drawing new shelf with data:', shelfData, " using scale factors:", this.stage.scale_X, this.stage.scale_Y);
    drawShelf(this.layer, this.stage, shelfData, template, this.scale_X, this.scale_Y, this.socket);

    // Redraw the layer
    this.layer.batchDraw();
  }

  deleteShelfFromMap(shelf_id) {
    console.log('Deleting shelf with ID:', shelf_id, this.store_number);

    // Call the deleteShelf function from the dataUtils
    deleteShelf(shelf_id, this.store_number);

    // Remove the shelf from the shelves array
    this.map.shelves = this.map.shelves.filter((shelf) => shelf.shelf_id !== shelf_id);
    // Remove the shelf from the layer
    const shelf = this.layer.findOne(`#${shelf_id}`);
    if (shelf) {
      shelf.destroy();
    }
    // TODO: fix Emit deleteShelf event
    //this.socket.emit('deleteShelf', { shelf_id: shelfId });


    // Redraw the layer
    this.layer.batchDraw();
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

