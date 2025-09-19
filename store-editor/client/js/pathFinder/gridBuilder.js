// GridBuilder class to create a grid representation of the store layout
export class GridBuilder {
    constructor(store, shelves) {
        this.store = store; // Store data (e.g., dimensions, starting points)
        this.shelves = shelves; // Shelf data
        this.gridData = null; // PF.Grid instance
    }
    init() {
      //initialize test data, for testing only
      //initializeTestData.call(this);
      // Initialize the grid with walkable cells (0)
      
      this.gridData = new PF.Grid(this.store.map_size.width, this.store.map_size.height);
      console.log('Grid initialized with dimensions:', this.store.map_size.width, this.store.map_size.height);
      // Use the polygon fill method for obstacles
      this.populateObstacles();
      console.log('Shelves marked as obstacles on the grid.');
      console.log('Final grid state:', this.gridData.nodes);

      drawGrid(this.gridData,10);
      return this.gridData;

    }

    markShelvesAsObstacles() {
        for (const shelf of this.shelves) {
            const template = this.store.shelf_templates[shelf.template];
            if (!template) continue;
            for (const [dx, dy] of template.shape) {
                const x = shelf.placement_x + dx;
                const y = shelf.placement_y + dy;
                // Mark cell as non-walkable (1)
                if (this.gridData.isInside(x, y)) {
                    this.gridData.setWalkableAt(x, y, false);
                }
            }
        }
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

    //Fill in grid with obstacles using shelf data.
    populateObstacles() {
        for (const shelf of this.shelves) {
            const template = this.store.shelf_templates[shelf.template];
            if (!template) continue;
            const { placement_x, placement_y } = shelf;
            const shape = template.shape || [];
            // Translate the shape to its actual position on the grid
            const rotatedShape = rotateShape(shape, shelf.rotation || 0);
            const translatedShape = rotatedShape.map(([dx, dy]) => [placement_x + dx, placement_y + dy]);
            // Get all grid cells covered by the polygon
            const coveredCells = this.getCoveredCells(translatedShape);
            // Mark each covered cell as non-walkable
            for (const [x, y] of coveredCells) {
                if (this.gridData.isInside(x, y)) {
                    this.gridData.setWalkableAt(x, y, false);
                }
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
}

function drawGrid(grid, cellSize = 10) {
    const canvas = document.getElementById('storeGrid');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let x = 0; x < grid.width; x++) {
        for (let y = 0; y < grid.height; y++) {
            // Non-walkable cells (obstacles)
            if (!grid.isWalkableAt(x, y)) {
                ctx.fillStyle = '#333';
            } else {
                ctx.fillStyle = '#eee';
            }
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
    }
}


export function initializeTestData() {
  this.store = {"store_number": 3260,
  "map_size": { "width": 100, "height": 60 },
  "store_shape": [[0,0],[0,60],[100,60],[100,0]],
  "walls": [],
  "shelf_templates": {
    "standard_shelf": {
      "shape": [[0,0],[0,2],[4,2],[4,0]],
      "access": "front",
      "color": "#b0c4de"
    },
    "feature_bin": {
      "shape": [[0,0],[0,4],[4,4],[4,0]],
      "access": "all_sides",
      "color": "#ffa500"
    }
  },
  "starting_points": [
    { "id": "Main_Entrance", "point": [10,50] }
  ],
  "registers": [
    { "id": "Checkout_1", "point": [40,0] }
  ]}

        this.shelves = [
    {
      "store_number": 3260,
      "shelf_id": "shelf_001",
      "template": "standard_shelf",
      "placement_x": 0,
      "placement_y": 0,
      "rotation": 0,
      "flex_items": [],
      "modulars": ["201"],
      "department": "frozen"
    },
    {
      "store_number": 3260,
      "shelf_id": "shelf_002",
      "template": "standard_shelf",
      "placement_x": 5,
      "placement_y": 5,
      "rotation": 0,
      "flex_items": [],
      "modulars": ["202"],
      "department": "dairy"
    },
    {
      "store_number": 3260,
      "shelf_id": "shelf_003",
      "template": "standard_shelf",
      "placement_x": 15,
      "placement_y": 10,
      "rotation": 0,
      "flex_items": [],
      "modulars": ["203"],
      "department": "produce"
    },
    {
      "store_number": 3260,
      "shelf_id": "shelf_004",
      "template": "standard_shelf",
      "placement_x": 20,
      "placement_y": 15,
      "rotation": 0,
      "flex_items": [],
      "modulars": ["204"],
      "department": "meat"
    },
    {
      "store_number": 3260,
      "shelf_id": "shelf_005",
      "template": "feature_bin",
      "placement_x": 25,
      "placement_y": 20,
      "rotation": 10,
      "flex_items": [],
      "modulars": ["205"],
      "department": "bakery"
    }
    ];
  }

  function rotateShape(shape, angleDegrees) {
    const angle = angleDegrees * Math.PI / 180;
    return shape.map(([x, y]) => [
        x * Math.cos(angle) - y * Math.sin(angle),
        x * Math.sin(angle) + y * Math.cos(angle)
    ]);
}