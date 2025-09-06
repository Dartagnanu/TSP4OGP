import {moveShelf} from "../dataUtils/shelfDataApi.js";
const gridSize = 20; // Size of each grid cell


export function drawStoreBoundary(layer, store, stageWidth, stageHeight) {
    console.log('Drawing store boundary for store:', store);
    // Clear previous boundary
    layer.find('.store-boundary').forEach((shape) => shape.destroy());

    console.log('mapSize:', store.map_size.width, store.map_size.height);
    const scaleX = stageWidth / store.map_size.width;
    const scaleY = stageHeight / store.map_size.height;
    console.log('storeShape:', store.store_shape);
    const scaledPoints = store.store_shape.flatMap(([x, y]) => [x * scaleX, y * scaleY]);

    const boundary = new Konva.Line({
        points: scaledPoints,
        stroke: 'blue',
        strokeWidth: 2,
        closed: true,
        name: 'store-boundary',
    });

    layer.add(boundary);
    layer.draw();
    return { scaleX, scaleY };
}

export function drawShelf(layer, stage, shelfData, template, scaleX, scaleY, socket) {
    console.log('Drawing shelf:', shelfData.shelf_id, 'with template:', template);
    const points = template.shape
        .map(([x, y]) => [x * scaleX, y * scaleY])
        .flat();

    const polygon = new Konva.Line({
        points,
        fill: template.color || '#828282ff',
        stroke: '#000',
        strokeWidth: 1,
        closed: true,
        draggable: true,
        rotation: shelfData.rotation || 0,
        x: (shelfData.placement_x || 0) * scaleX,
        y: (shelfData.placement_y || 0) * scaleY,
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
        console.log('Dragging shelf:', shelfData, 'to position:', pos);

        const snappedX = Math.round(pos.x / gridSize) * gridSize;
        const snappedY = Math.round(pos.y / gridSize) * gridSize;

        // TODO: update shelfdata only when position snapped and changes
        polygon.position({ x: snappedX, y: snappedY });
        // Update the tooltip position to follow the shape
        tooltip.position({ x: snappedX + 20, y: snappedY - 20 });

        console.log('Snapped position:', { x: snappedX, y: snappedY });
        // TODO: Finish auto update functionality
        socket.emit('updateShelf', {
            shelf_id: shelfData.shelf_id,
            x: snappedX / scaleX,
            y: snappedY / scaleY,
            rotation: shelfData.rotation,
            store_id: shelfData.store_id,
        });
        console.log('updated shelf', { id: shelfData.shelf_id,
            x: snappedX / scaleX,
            y: snappedY / scaleY,
            rotation: shelfData.rotation,
            store_id: shelfData.store_id,});
        moveShelf(shelfData, snappedX / scaleX, snappedY / scaleY);
        layer.batchDraw();
    });
    

   

    layer.draw();
}

export function loadShelves(layer, stage, shelvesData, templates, scaleX, scaleY, socket) {
    console.log('Loading shelves with templates:', templates);
    shelvesData.forEach((shelfData) => {
        console.log('Loading shelf data:', shelfData);
        const template = templates[shelfData.template];
        if (template) {
            drawShelf(layer, stage, shelfData, template, scaleX, scaleY, socket);
        }
    });
}


export function drawStartingPoints(layer, startingPoints, scaleX, scaleY) {
    

    startingPoints.forEach((point) => {
        console.log('Drawing starting point:', point);
        const [x, y] = point.point;

        // Draw the starting point as a circle
        const circle = new Konva.Circle({
            x: x * scaleX,
            y: y * scaleY,
            radius: 5, // Radius of the dot
            fill: 'red',
            stroke: 'black',
            strokeWidth: 1,
        });

        // Draw the label for the starting point
        const label = new Konva.Text({
            x: x * scaleX + 10, // Offset the label slightly
            y: y * scaleY - 10,
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