export function createStage(containerId, stageWidth, stageHeight) {
  const stage = new Konva.Stage({
    container: containerId,
    width: stageWidth,
    height: stageHeight,
  });
  const layer = new Konva.Layer();
  stage.add(layer);
  return { stage, layer };
}
