import {
    pixelsPerFoot,
    strokeWidthForMap,
    clampPx,
    getStageZoom,
    compensateForStageZoom,
} from '../../konva/mapUnits.js';

export class PathOverlay {
    constructor(stage) {
        this.stage = stage;
        this.layer = new Konva.Layer({ name: 'path-overlay', listening: false });
        stage.add(this.layer);
        this.layer.moveToTop();
    }

    clear() {
        this.layer.destroyChildren();
        this.layer.batchDraw();
    }

    _toStage(coord, scale_X, scale_Y) {
        return { x: coord[0] * scale_X, y: coord[1] * scale_Y };
    }

    drawRoute(scale_X, scale_Y, startCoord, result) {
        this.clear();

        const ppf = pixelsPerFoot(scale_X, scale_Y);
        const routeStroke = strokeWidthForMap(ppf, { min: 1, max: 3, factor: 0.5 });
        const stopRadius = clampPx(ppf * 2.5, 4, 9);
        const stopLabelSize = clampPx(ppf * 5, 8, 11);
        const dashMain = Math.max(4, ppf * 2.5);
        const dashGap = Math.max(3, ppf * 1.5);

        const linePoints = [];
        const stops = [];

        if (startCoord) {
            const s = this._toStage(startCoord, scale_X, scale_Y);
            linePoints.push(s.x, s.y);
            stops.push({ x: s.x, y: s.y, label: 'S' });
        }

        let pickNum = 0;
        for (const entry of result) {
            if (entry.type === 'return') continue;
            if (entry.unreachable || !entry.location) continue;
            const p = this._toStage(entry.location, scale_X, scale_Y);
            linePoints.push(p.x, p.y);
            pickNum += 1;
            stops.push({ x: p.x, y: p.y, label: String(pickNum) });
        }

        const returnEntry = result.find((e) => e.type === 'return');
        if (returnEntry?.location) {
            const e = this._toStage(returnEntry.location, scale_X, scale_Y);
            linePoints.push(e.x, e.y);
            stops.push({ x: e.x, y: e.y, label: 'E' });
        }

        if (linePoints.length >= 4) {
            this.layer.add(
                new Konva.Line({
                    points: linePoints,
                    stroke: '#2563eb',
                    strokeWidth: routeStroke,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dash: [dashMain, dashGap],
                    listening: false,
                })
            );
        }

        const stopStroke = strokeWidthForMap(ppf, { min: 0.75, max: 2, factor: 0.35 });

        for (const stop of stops) {
            const group = new Konva.Group({ listening: false });
            const circle = new Konva.Circle({
                x: stop.x,
                y: stop.y,
                radius: stopRadius,
                fill: '#2563eb',
                stroke: '#ffffff',
                strokeWidth: stopStroke,
            });
            circle.setAttr('baseRadius', stopRadius);
            circle.setAttr('baseStrokeWidth', stopStroke);
            group.add(circle);

            const text = new Konva.Text({
                x: stop.x,
                y: stop.y,
                text: stop.label,
                fontSize: stopLabelSize,
                fontStyle: 'bold',
                fill: '#ffffff',
                align: 'center',
                verticalAlign: 'middle',
            });
            text.setAttr('baseFontSize', stopLabelSize);
            text.offsetX(text.width() / 2);
            text.offsetY(text.height() / 2);
            group.add(text);
            this.layer.add(group);
        }

        this.applyZoomCompensation();
        this.layer.batchDraw();
    }

    applyZoomCompensation() {
        const zoom = getStageZoom(this.stage);
        for (const group of this.layer.getChildren()) {
            if (group.getClassName() !== 'Group') continue;
            const circle = group.findOne('Circle');
            const text = group.findOne('Text');
            if (circle?.getAttr('baseRadius')) {
                circle.radius(compensateForStageZoom(circle.getAttr('baseRadius'), zoom));
                circle.strokeWidth(
                    compensateForStageZoom(circle.getAttr('baseStrokeWidth'), zoom)
                );
            }
            if (text?.getAttr('baseFontSize')) {
                text.fontSize(compensateForStageZoom(text.getAttr('baseFontSize'), zoom));
                text.offsetX(text.width() / 2);
                text.offsetY(text.height() / 2);
            }
        }
    }
}
