import { createItemIndex, getItemIndex, updateItemIndex, deleteItemIndex, updateItemIndexByUpc } from './ItemIndexUtils';
import { createStore, getStore, updateStore, deleteStore } from './storeUtils.js';
import { createItem, getItem, updateItem, deleteItem } from './itemUtils.js';
import { createModular, getModular, updateModular, deleteModular } from './modularUtils.js';
import { createShelf, getShelf, updateShelf, deleteShelf } from './shelfUtils.js';

// batch update item indexes using modular and shelf this uses the modular's 
// items to look up all the indexes necessary, takes the shelf off the index

export async function removeModularFromShelf(modular, shelf) {
    try {
        // Remove modular ID from shelf's modulars array
        shelf.modulars = shelf.modulars.filter(id => id !== modular.id);
        await updateShelf(shelf.id, { modulars: shelf.modulars });
        // For each item in the modular, find and update the corresponding item index
        let i = 1;
        for (const item of modular.items) {
            
            const itemIndex = await getItemIndexByItemNumberAndStoreId(item.item_number, shelf.store);
            if (itemIndex) {
                // Update the item index with the new shelf information
                itemIndex.locations = itemIndex.locations.filter(location => location.shelf !== shelf.id);
                await updateItemIndex(itemIndex.id, shelf.store, { shelf: shelf.id });
                i++;
            }
            else {
                console.warn(`Item index not found for item number ${item.item_number} in store ${shelf.store}`);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Error removing modular from shelf:', error);
        throw error;
    }
}

// batch update item indexes using modular and shelf this uses the modular's 
// items to look up all the indexes necessary, then adds the shelf and location to the index

export async function addModularToShelf(modular, shelf) {
    try {
        // Remove modular ID from shelf's modulars array
        shelf.modulars = shelf.modulars.filter(id => id !== modular.id);
        await updateShelf(shelf.id, { modulars: shelf.modulars });
        // For each item in the modular, find and update the corresponding item index
        let i = 1;
        for (const item of modular.items) {
            
            const index = await getItemIndexByItemNumberAndStoreId(item.item_number, shelf.store);
            if (index) {
                // Update the item index with the new shelf information
                index.locations.push({ shelf: shelf.id, location: i });
                await updateItemIndex(index.id, { locations: index.locations });
                i++;
            }
            else {
                console.warn(`Item index not found for item number ${item.item_number} in store ${shelf.store}`);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Error removing modular from shelf:', error);
        throw error;
    }
}

// Modify shelf for when a shelf is moved
export async function moveShelf(shelfData, x, y) {
    try {
        // Update the shelf's position
        shelfData.placement_x = x;
        shelfData.placement_y = y;
        await updateShelf(shelfData, shelfData.store);

        return { success: true };
    } catch (error) {
        console.error('Error moving shelf:', error);
        throw error;
    }
}

// add shelf to a store
export async function addShelf(shelfData) {
    try {
        const response = await createShelf(shelfData);
        return response;
    } catch (error) {
        console.error('Error adding shelf:', error);
        throw error;
    }
}