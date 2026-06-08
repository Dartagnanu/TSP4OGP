export function createStage(containerId, stageWidth, stageHeight) {
  const stage = new Konva.Stage({
    container: containerId,
    width: stageWidth,
    height: stageHeight,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  // Add zoom functionality
  stage.on('wheel', (e) => {
    e.evt.preventDefault(); // Prevent the default browser scroll behavior

    const scaleBy = 1.05; // Zoom factor
    const oldScale = stage.scaleX(); // Current scale
    const pointer = stage.getPointerPosition(); // Mouse pointer position

    // Calculate the new scale
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    // Adjust the stage position to zoom in/out at the pointer position
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    stage.position(newPos);
    stage.batchDraw();
    stage.fire('zoomChange', { scale: newScale });
  });

  return { stage, layer };
}
