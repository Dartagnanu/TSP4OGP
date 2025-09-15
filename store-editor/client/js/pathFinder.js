import { getItemIndex } from "./dataUtils/ItemIndexUtils.js";
export class PathFinder {
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
            this.gridData = new PF.Grid(this.store.map_size.width, this.store.map_size.height); // Use PF.Grid
            this.finder = new PF.AStarFinder(); // Use PF.AStarFinder
            console.log('Grid and AStarFinder initialized successfully.');
        } catch (error) {
            console.error('Error initializing Grid or AStarFinder:', error);
        }

        //get 

        //Fill in grid data with obstacles
        this.populateObstacles();
    }

    //Fill in grid with obstacles using shelf data, from upcs.
    populateObstacles() {
        for (const shelf of this.shelves) {
            const { placement_x, placement_y, template } = shelf;
            const shape = template.shape || [];

            // Translate the shape to its actual position on the grid
            const translatedShape = shape.map(([dx, dy]) => [placement_x + dx, placement_y + dy]);

            // Get all grid cells covered by the polygon
            const coveredCells = this.getCoveredCells(translatedShape);

            // Mark each covered cell as non-walkable
            for (const [x, y] of coveredCells) {
                this.gridData.setWalkableAt(x, y, false);
            }
        }
    }

    // Get all grid cells covered by a polygon
    getCoveredCells(polygon) {
        const cells = [];
        const [minX, minY, maxX, maxY] = this.getBoundingBox(polygon);

        // Iterate over all grid cells in the bounding box
        for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
            for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
                // Check if the center of the grid cell is inside the polygon
                if (this.isPointInPolygon([x + 0.5, y + 0.5], polygon)) {
                    cells.push([x, y]);
                }
            }
        }

        return cells;
    }

    // Get the bounding box of a polygon
    getBoundingBox(polygon) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const [x, y] of polygon) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }

        return [minX, minY, maxX, maxY];
    }

    // Check if a point is inside a polygon using the ray-casting algorithm
    isPointInPolygon(point, polygon) {
        const [px, py] = point;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];

            const intersect = ((yi > py) !== (yj > py)) &&
                              (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }

    // Determine the cost of a tile (0 = walkable, 1 = obstacle)
    getTileCost(x, y) {
        for (const shelf of this.shelves) {
            const { placement_x, placement_y, template } = shelf;
            const shape = template.shape || [];
            for (const [dx, dy] of shape) {
                if (x === placement_x + dx && y === placement_y + dy) {
                    return 1; // Non-walkable
                }
            }
        }
        return 0; // Walkable
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
        const tspSolver = new tsp.TSP();
        const optimalOrder = tspSolver.solve(points);

        return optimalOrder.map((index) => items[index]);
    }
}