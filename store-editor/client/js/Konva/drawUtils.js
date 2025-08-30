
export function drawStoreBoundary(layer, map, stageWidth, stageHeight) {
    // Clear previous boundary
    layer.find('.store-boundary').forEach((shape) => shape.destroy());

    // Todo: storeShape check causing issues after modularization of function
    //if (!map.storeShape || map.storeShape.length === 0) return;

    console.log('mapSize:', map.map_size.width, map.map_size.height);
    const scaleX = stageWidth / map.map_size.width;
    const scaleY = stageHeight / map.map_size.height;
    console.log('storeShape:', map.store_shape);
    const scaledPoints = map.store_shape.flatMap(([x, y]) => [x * scaleX, y * scaleY]);

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

export function drawShelf(layer, stage, shelfData, template, scaleX, scaleY) {
    console.log('Drawing shelf:', shelfData.id, 'with template:', template);
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
        x: (shelfData.placement?.[0] || 0) * scaleX,
        y: (shelfData.placement?.[1] || 0) * scaleY,
    });

    polygon.id(shelfData.id);
    layer.add(polygon);

    
    // Tooltip added
    const tooltip = new Konva.Text({
        text: `Shelf ID: ${shelfData.id}\nModulars: ${shelfData.modulars?.join(', ')}\nFlex Items: ${shelfData.flex_items?.length}\n`,
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


    // live broadcast drag for realtime sync maybe?
    //polygon.on('dragmove', () => {
    //  const pos = polygon.position();
    //  socket.emit('updateShelf', { id: shelfData.id, x: pos.x, y: pos.y });
    //});

    layer.draw();
}

export function loadShelves(layer, stage, shelvesData, templates, scaleX, scaleY) {
    shelvesData.forEach((shelfData) => {
        const template = templates[shelfData.template];
        if (template) {
            drawShelf(layer, stage, shelfData, template, scaleX, scaleY);
        }
    });
}
