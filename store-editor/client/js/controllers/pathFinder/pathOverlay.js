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
                    strokeWidth: 3,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dash: [10, 6],
                    listening: false,
                })
            );
        }

        for (const stop of stops) {
            const group = new Konva.Group({ listening: false });
            group.add(
                new Konva.Circle({
                    x: stop.x,
                    y: stop.y,
                    radius: 9,
                    fill: '#2563eb',
                    stroke: '#ffffff',
                    strokeWidth: 2,
                })
            );
            const text = new Konva.Text({
                x: stop.x,
                y: stop.y,
                text: stop.label,
                fontSize: 11,
                fontStyle: 'bold',
                fill: '#ffffff',
                align: 'center',
                verticalAlign: 'middle',
            });
            text.offsetX(text.width() / 2);
            text.offsetY(text.height() / 2);
            group.add(text);
            this.layer.add(group);
        }

        this.layer.batchDraw();
    }
}
