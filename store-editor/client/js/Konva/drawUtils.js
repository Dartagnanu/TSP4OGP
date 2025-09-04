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
        console.log('Snapped position:', { x: snappedX, y: snappedY });
        // TODO: Finish auto update functionality
        socket.emit('updateShelf', { id: shelfData.id, x: pos.x, y: pos.y });
        console.log('updated shelf to', { id: shelfData.id, x: snappedX / scaleX, y: snappedY / scaleY });
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
