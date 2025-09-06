import { createStage } from '../Konva/konvaSetup.js';
import { drawStoreBoundary, drawShelf, loadShelves, drawStartingPoints } from '../Konva/drawUtils.js';
import {getStore} from '../dataUtils/storeUtils.js';
import {getShelf, getShelvesByStore} from '../dataUtils/shelfUtils.js';
import { ContextMenu} from './contextMenu/contextMenu.js';

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
    const map = await this.fetchMap(this.store_number);
    console.log('Fetched map');
    const {scaleX, scaleY} = drawStoreBoundary(layer, map.store, this.stage_width, this.stage_height);
    console.log('Scale factors:', scaleX, scaleY);
    // load shelves from map

    loadShelves(layer, stage, map.shelves, map.store.shelf_templates, scaleX, scaleY, this.socket);
    drawStartingPoints(layer, map.store.starting_points, scaleX, scaleY);
    // 
    // Initialize the context menu
    const contextMenu = new ContextMenu(stage, map.store.shelf_templates, layer, map.shelves);
    contextMenu.init();

    return { contextMenu, layer, map, stage};
  }

}

