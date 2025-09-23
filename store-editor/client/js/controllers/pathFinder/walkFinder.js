export class walkFinder {
    constructor(Map, GTSP_SERVER_URL) {
        this.Map = Map;
        this.GTSP_SERVER_URL = GTSP_SERVER_URL;
    }

    init() {
    }
    // Process a pickwalk in GTSP server
    async findPath(store_number, pickwalk) {
        const upcs = pickwalk.itemList.map(item => item.upc);
        console.log('Finding path for pickwalk with UPCs:', upcs);
        fetch(`${this.GTSP_SERVER_URL}/find-path`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ store: store_number, upcs: upcs })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Path found:', data);
        })
        .catch(error => {
            console.error('Error finding path:', error);
        });

    }
}