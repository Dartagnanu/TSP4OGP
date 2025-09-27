import {moveShelf} from "../dataUtils/shelfDataApi.js";
const gridSize = 10; // Size of each grid cell

// Helper function to calculate the centroid of a polygon
function calculatePolygonCentroid(shape, scale_X, scale_Y) {
    let sumX = 0;
    let sumY = 0;
    const numPoints = shape.length;
    
    for (const [x, y] of shape) {
        sumX += x * scale_X;
        sumY += y * scale_Y;
    }
    
    return {
        x: sumX / numPoints,
        y: sumY / numPoints
    };
}


export function drawStoreBoundary(layer, store, stageWidth, stageHeight) {
    console.log('Drawing store boundary for store:', store);
    // Clear previous boundary
    layer.find('.store-boundary').forEach((shape) => shape.destroy());

    console.log('mapSize:', store.map_size.width, store.map_size.height);
    const scale_X = stageWidth / store.map_size.width;
    const scale_Y = stageHeight / store.map_size.height;
    console.log('storeShape:', store.store_shape);
    const scaledPoints = store.store_shape.flatMap(([x, y]) => [x * scale_X, y * scale_Y]);

    const boundary = new Konva.Line({
        points: scaledPoints,
        stroke: 'blue',
        strokeWidth: 2,
        closed: true,
        name: 'store-boundary',
    });

    layer.add(boundary);
    layer.draw();
    return { scale_X, scale_Y };
}

export function drawShelf(layer, stage, shelfData, template, scale_X, scale_Y, socket) {
    console.log('Drawing shelf:', shelfData.shelf_name, 'with template:', template);
    const points = template.shape
        .map(([x, y]) => [x * scale_X, y * scale_Y])
        .flat();

    const polygon = new Konva.Line({
        points,
        fill: template.color || '#828282ff',
        stroke: '#000',
        strokeWidth: 1,
        closed: true,
        draggable: true,
        rotation: shelfData.rotation || 0,
        x: (shelfData.placement_x || 0) * scale_X,
        y: (shelfData.placement_y || 0) * scale_Y,
    });

    polygon.id(shelfData.shelf_name);
    
    // Calculate the centroid (center) of the polygon
    const centroid = calculatePolygonCentroid(template.shape, scale_X, scale_Y);
    
    // Create an arrow pointing down in the center of the polygon
    const arrow = new Konva.Line({
        points: [0, -10, 0, 10, -5, 5, 0, 10, 5, 5], // Arrow shape pointing down
        stroke: '#000',
        strokeWidth: 2,
        lineCap: 'round',
        lineJoin: 'round',
        x: centroid.x, // Position at polygon center
        y: centroid.y, // Position at polygon center
        rotation: 0, // Group handles rotation
    });

    // Create shelf name text overlay
    const shelfNameText = new Konva.Text({
        text: shelfData.shelf_name || 'Unknown',
        fontSize: 12,
        fontFamily: 'Arial',
        fill: '#000',
        align: 'center',
        x: centroid.x,
        y: centroid.y - 25, // Position above the arrow
        offsetX: 0, // Will be set after measuring text width
        offsetY: 0,
    });

    // Center the text horizontally
    shelfNameText.offsetX(shelfNameText.width() / 2);
    shelfNameText.offsetY(shelfNameText.height() / 2);

    // Group the polygon and arrow together so they move as one unit
    const shelfGroup = new Konva.Group({
        x: (shelfData.placement_x || 0) * scale_X,
        y: (shelfData.placement_y || 0) * scale_Y,
        rotation: shelfData.rotation || 0,
        draggable: true,
        // Store the complete shelf data on the group
        shelfData: shelfData
    });

    // Reset polygon position since it's now inside the group
    polygon.x(0);
    polygon.y(0);
    polygon.rotation(0);
    polygon.draggable(false);

    // Reset arrow rotation since the group handles rotation
    arrow.rotation(0);

    shelfGroup.add(polygon);
    shelfGroup.add(arrow);
    shelfGroup.id(shelfData.shelf_name);
    layer.add(shelfGroup);

    console.log('Shelf drawn at:', shelfGroup.position(), 'with original data:', shelfData);

    // Tooltip added
    const tooltip = new Konva.Text({
        text: `Shelf Name: ${shelfData.shelf_name}\nModulars: ${shelfData.modulars?.join(', ')}\nFlex Items: ${shelfData.flex_items?.length}\n`,
        fontSize: 14,
        fontFamily: 'Calibri',
        fill: 'black',
        padding: 5,
        visible: false,
    });
    layer.add(tooltip);

    // Show tooltip on hover
    shelfGroup.on('mouseenter', () => {
        polygon.strokeWidth(2);
        const mousePos = stage.getPointerPosition();
        tooltip.position({ x: mousePos.x + 10, y: mousePos.y - 10 });
        tooltip.visible(true);
        layer.batchDraw();
    });

    // Update tooltip position on mouse move
    shelfGroup.on('mousemove', () => {
        const mousePos = stage.getPointerPosition();
        tooltip.position({ x: mousePos.x + 10, y: mousePos.y - 10 });
        layer.batchDraw();
    });

    // Hide tooltip on mouse leave
    shelfGroup.on('mouseleave', () => {
        polygon.strokeWidth(1);
        tooltip.visible(false);
        layer.batchDraw();
    });
    
    // Snap to grid on dragmove and emit update via socket
    shelfGroup.on('dragmove', () => {
        const pos = shelfGroup.position();

        const snappedX = Math.round(pos.x / gridSize) * gridSize;
        const snappedY = Math.round(pos.y / gridSize) * gridSize;
        
        // Get current shelf data from the group (not the original shelfData)
        const currentShelfData = shelfGroup.getAttr('shelfData');
        
        // TODO: update shelfdata only when position snapped and changes
        shelfGroup.position({ x: snappedX, y: snappedY });
        // Update the tooltip position to follow the shape
        tooltip.position({ x: snappedX + 20, y: snappedY - 20 });

        // Compare against current shelf data, not original
        if (snappedX == currentShelfData.placement_x * scale_X && snappedY == currentShelfData.placement_y * scale_Y) {
            // Position is snapped and unchanged
            //console.log('Position unchanged after snapping, not emitting update.');
            return;
        }
        
        // TODO: Finish auto update functionality
        socket.emit('updateShelf', {
            shelf_name: shelfGroup.id(), // Use current ID instead of old shelfData
            x: snappedX / scale_X,
            y: snappedY / scale_Y,
            rotation: currentShelfData.rotation,
            store_number: currentShelfData.store_number,
        });
        console.log('updated shelf', { 
            id: shelfGroup.id(),
            x: snappedX / scale_X,
            y: snappedY / scale_Y,
            rotation: currentShelfData.rotation,
            store_number: currentShelfData.store_number,
        });
        
        // Create updated shelf data with new position
        const updatedShelfData = {
            ...currentShelfData, // Use current data from the group
            shelf_name: shelfGroup.id(), // Use current ID
            placement_x: snappedX / scale_X,
            placement_y: snappedY / scale_Y
        };
        
        // Update the shelf data stored on the group
        shelfGroup.setAttr('shelfData', updatedShelfData);
        console.log('Updated shelf data stored on group:', updatedShelfData);
        
        moveShelf(updatedShelfData, snappedX / scale_X, snappedY / scale_Y);
        layer.batchDraw();
    });

    layer.draw();
}

export function loadShelves(layer, stage, shelvesData, templates, scale_X, scale_Y, socket) {
    console.log('Loading shelves with templates:', templates);
    shelvesData.forEach((shelfData) => {
        console.log('Loading shelf data:', shelfData);
        const template = templates[shelfData.template];
        if (template) {
            drawShelf(layer, stage, shelfData, template, scale_X, scale_Y, socket);
        }
    });
}


export function drawStartingPoints(layer, startingPoints, scale_X, scale_Y) {
    

    startingPoints.forEach((point) => {
        console.log('Drawing starting point:', point);
        const [x, y] = point.point;

        // Draw the starting point as a circle
        const circle = new Konva.Circle({
            x: x * scale_X,
            y: y * scale_Y,
            radius: 5, // Radius of the dot
            fill: 'red',
            stroke: 'black',
            strokeWidth: 1,
        });

        // Draw the label for the starting point
        const label = new Konva.Text({
            x: x * scale_X + 10, // Offset the label slightly
            y: y * scale_Y - 10,
            text: 'Starting Point',
            fontSize: 14,
            fontFamily: 'Calibri',
            fill: 'black',
        });

        // Add the circle and label to the layer
        layer.add(circle);
        layer.add(label);
    });

    layer.draw(); // Redraw the layer to show the starting points
}