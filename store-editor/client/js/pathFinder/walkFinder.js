import { getItemIndex } from "../dataUtils/ItemIndexUtils.js";
import { GridBuilder } from "./gridBuilder.js";

export class walkFinder {
    constructor(map) {
        this.store = map.store; // Store data (e.g., dimensions, starting points)
        console.log('Store Object:', this.store);
        this.shelves = map.shelves; // Shelf data
    }

    init() {
        // Debugging: Check if PF, Grid, and AStarFinder are available
        console.log('Checking if PF is available:', typeof PF !== 'undefined' ? 'Yes' : 'No');
        console.log('Checking if PF.Grid is available:', typeof PF?.Grid !== 'undefined' ? 'Yes' : 'No');
        console.log('Checking if PF.AStarFinder is available:', typeof PF?.AStarFinder !== 'undefined' ? 'Yes' : 'No');
        console.log('Store Dimensions:', this.store.map_size.height, this.store.map_size.width);
    
        // Attempt to create the grid and pathfinder
        try {
            this.gridBuilder = new GridBuilder(this.store, this.shelves);
            this.gridBuilder.init();
            this.finder = new PF.AStarFinder(); // Use PF.AStarFinder
            console.log('Grid and AStarFinder initialized successfully.');
        } catch (error) {
            console.error('Error initializing Grid or AStarFinder:', error);
        }



    }

    

    // Process a pickwalk and fill out item data
    findPath(pickwalk) {
        if (!this.store.starting_points || this.store.starting_points.length === 0) {
            console.error('No starting points defined in the store.');
            return null;
        }
        console.log('Processing pickwalk:', pickwalk);

        // Use the first starting point from the store
        const startingPoint = this.store.starting_points[0];
        console.log('Using Starting Point:', startingPoint);

        const path = [];
        const itemsWithLocations = [];

        console.log("itemlist:", pickwalk);
        // Map items to their shelf locations using the getItemIndex function
        pickwalk.itemList.forEach((item) => {
            const shelves = getItemIndex(item.upc, this.store_number); // Use the provided item lookup function
            if (shelves && shelves.length > 0) {
                const shelf = shelves[0];
                itemsWithLocations.push({
                    ...item,
                    shelf_id: shelf.shelf_id,
                    location: {
                        x: shelf.placement_x,
                        y: shelf.placement_y,
                    },
                });
            } else {
                console.warn(`Item with UPC ${item.upc} not found in any shelf.`);
                // Handle items not found in any shelf
                itemsWithLocations.push({
                    ...item,
                    shelf_id: null,
                    location: {
                        x: null,
                        y: null,
                    },
                });
            }
        });

        // Sort items by the optimal path (TSP or heuristic)
        const sortedItems = this.optimizeItemOrder(startingPoint, itemsWithLocations);

        // Calculate the path using A* for each item
        let currentPosition = { x: startingPoint.x, y: startingPoint.y };
        sortedItems.forEach((item) => {
            const itemPath = this.finder.findPath(
                currentPosition.x,
                currentPosition.y,
                item.location.x,
                item.location.y,
                this.gridData.clone()
            );
            if (path.length > 0) {
                path.pop(); // Remove the last point to avoid duplication
            }
            path.push(...itemPath);
            currentPosition = item.location;
        });

        console.log('Vector Map:', this.vectorMap);
        console.log('Calculated Path:', path);

        return {
            ...pickwalk,
            itemList: sortedItems,
            path,
        };
    }

    // Optimize the order of items (basic heuristic or TSP)
    optimizeItemOrder(startingPoint, items) {
        const points = items.map((item) => [item.location.x, item.location.y]);
        //Fixme: Implement a simple nearest neighbor heuristic for now
        //const tspSolver = new tsp.TSP();
       // const optimalOrder = tspSolver.solve(points);

        return optimalOrder.map((index) => items[index]);
    }
}