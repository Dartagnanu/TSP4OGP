import { createStage } from '../Konva/konvaSetup.js';
import { drawStoreBoundary, drawShelf, loadShelves } from '../Konva/drawUtils.js';
import {getStore} from '../dataUtils/storeUtils.js';
import {getShelf, getShelvesByStore} from '../dataUtils/shelfUtils.js';

// fetch and collect map data
export async function fetchMap(store_number) {
  let store = await getStore(store_number);
  
  let shelves = await getShelvesByStore(store_number);
  console.log('Fetched store and shelves:', store, shelves);
  return { store, shelves };
}

// stageMap
export async function stageMap(store_number, stage_width, stage_height, socket) {
  
  const { stage, layer } = createStage('container', stage_width, stage_height);
  const map = await fetchMap(store_number);
  console.log('Fetched map');
  const {scaleX, scaleY} = drawStoreBoundary(layer, map.store, stage_width, stage_height);
  console.log('Scale factors:', scaleX, scaleY);
  // load shelves from map

  loadShelves(layer, stage, map.shelves, map.store.shelf_templates, scaleX, scaleY, socket);
  return { map, layer};
}



