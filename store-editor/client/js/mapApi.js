export async function fetchMap(mapId) {
    try {
        const res = await fetch(`/map/${mapId}`);
        if (!res.ok) throw new Error('Network response was not ok');
        return await res.json();
    } catch (err) {
        console.error('Fetch map failed:', err);
        throw err;
    }
}

export async function saveMap(mapData) {
    try {
        console.log('Saving map with data\n', mapData);
        console.log(' feature_001 data:', mapData.shelves(feature_001));
        mapData.shelves= {
      "id": "shelf_001",
      "template": "standard_shelf",
      "placement": [5,5],
      "rotation": 0,
      "modulars": ["123f"],
      "flex_items": [9576113, 9576114, 9576115],
      "department": "frozen"
    },
    {
      "id": "feature_001",
      "template": "feature_bin",
      "placement": [10,10],
      "rotation": 10,
      "modulars": [],
      "flex_items": [9576113],
      "department": "gm"
    };
        const mapId = mapData.store_id;
        const res = await fetch(`/map/${mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapData, null, 2),
        });
        if (!res.ok) throw new Error('Network response was not ok');
        return await res.json();
    } catch (err) {
        console.error('Save map failed:', err);
        throw err;
    }
}

export async function deleteShelfFromMap(mapId, shelfId) {
  try {
    const res = await fetch(`/map/${mapId}/shelves/${shelfId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Delete shelf failed');
    return await res.json();
  } catch (err) {
    console.error('Delete shelf failed:', err);
    throw err;
  }
}

