export class walkFinder {
    constructor(GTSP_SERVER_URL) {
        this.GTSP_SERVER_URL = GTSP_SERVER_URL;
    }

    _resolvePoint(field) {
        if (!field) return null;
        if (field.point) return field.point;
        if (Array.isArray(field) && field[0]?.point) return field[0].point;
        return null;
    }

    _buildRequestBody(store_number, pickwalk) {
        const upcs = pickwalk.itemList.map((item) => item.upc);
        const body = { store: store_number, upcs };
        const startPoint = this._resolvePoint(pickwalk.starting_point);
        let endPoint = this._resolvePoint(pickwalk.end_point);

        if (startPoint) {
            body.start = startPoint;
            body.end = endPoint ?? startPoint;
            endPoint = body.end;
        }

        return { body, upcs, startPoint, endPoint };
    }

    async findPath(store_number, pickwalk) {
        const { body, upcs, startPoint, endPoint } = this._buildRequestBody(
            store_number,
            pickwalk
        );
        console.log('Finding path for pickwalk with UPCs:', upcs);
        console.log('Sending find-path request…', body);

        const response = await fetch(`${this.GTSP_SERVER_URL}/find-path`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            const msg =
                data?.message || data?.error || `find-path failed (${response.status})`;
            throw new Error(msg);
        }

        if (!Array.isArray(data)) {
            const msg =
                data?.message || data?.error || 'Expected path array from server';
            throw new Error(msg);
        }

        const totalDistance = data.reduce(
            (sum, entry) => sum + (entry.distance_from_previous || 0),
            0
        );
        console.log(
            `Path found: ${data.length} entries, total grid distance ${totalDistance}`
        );

        return { result: data, pickwalk, startPoint, endPoint };
    }
}
