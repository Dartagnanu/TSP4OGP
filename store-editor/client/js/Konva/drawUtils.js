import {moveShelf} from "../dataUtils/shelfDataApi.js";
const gridSize = 10; // Size of each grid cell


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
    console.log('Drawing shelf:', shelfData.shelf_id, 'with template:', template);
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

    polygon.id(shelfData.shelf_id);
    layer.add(polygon);

    console.log('Shelf drawn at:', polygon.position(), 'with original data:', shelfData);

    // Tooltip added
    const tooltip = new Konva.Text({
        text: `Shelf ID: ${shelfData.shelf_id}\nModulars: ${shelfData.modulars?.join(', ')}\nFlex Items: ${shelfData.flex_items?.length}\n`,
        fontSize: 14,
        fontFamily: 'Calibri',
        fill: 'black',
        padding: 5,
        visible: false,
    });
    layer.add(tooltip);

    // Show tooltip on hover
    polygon.on('mouseenter', () => {
        polygon.strokeWidth(2);
        const mousePos = stage.getPointerPosition();
        tooltip.position({ x: mousePos.x + 10, y: mousePos.y - 10 });
        tooltip.visible(true);
        layer.batchDraw();
    });

    // Update tooltip position on mouse move
    polygon.on('mousemove', () => {
        const mousePos = stage.getPointerPosition();
        tooltip.position({ x: mousePos.x + 10, y: mousePos.y - 10 });
        layer.batchDraw();
    });

    // Hide tooltip on mouse leave
    polygon.on('mouseleave', () => {
        polygon.strokeWidth(1);
        tooltip.visible(false);
        layer.batchDraw();
    });
    
    // Snap to grid on dragmove and emit update via socket
    polygon.on('dragmove', () => {
        const pos = polygon.position();

        const snappedX = Math.round(pos.x / gridSize) * gridSize;
        const snappedY = Math.round(pos.y / gridSize) * gridSize;
        
        //console.log('Dragging shelf:', shelfData, 'to position:', pos);

        // TODO: update shelfdata only when position snapped and changes
        polygon.position({ x: snappedX, y: snappedY });
        // Update the tooltip position to follow the shape
        tooltip.position({ x: snappedX + 20, y: snappedY - 20 });

        //console.log('Snapped position:', { x: snappedX, y: snappedY });
        if (snappedX == shelfData.placement_x * scale_X && snappedY == shelfData.placement_y * scale_Y) {
            // Position is snapped and unchanged

            return;
        }
        
        // TODO: Finish auto update functionality
        socket.emit('updateShelf', {
            shelf_id: shelfData.shelf_id,
            x: snappedX / scale_X,
            y: snappedY / scale_Y,
            rotation: shelfData.rotation,
            store_id: shelfData.store_id,
        });
        console.log('updated shelf', { id: shelfData.shelf_id,
            x: snappedX / scale_X,
            y: snappedY / scale_Y,
            rotation: shelfData.rotation,
            store_id: shelfData.store_id,});
        moveShelf(shelfData, snappedX / scale_X, snappedY / scale_Y);
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