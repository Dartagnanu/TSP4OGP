// create item index
export const createItemIndex = async (itemIndexData) => {
  try {
    const response = await fetch('/itemIndex', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemIndexData),
    });
    if (!response.ok) throw new Error('Failed to create item index');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// get item index by upc and store ID
export const getItemIndex = async (upc, storeId) => {
    try {
        const response = await fetch(`/itemIndex/upc/${upc}/store/${storeId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ store: storeId }),
        });
        if (!response.ok) throw new Error('Failed to fetch item index');
        return await response.json();
    } catch (error) {
        console.error(error);
    }
};

// update item index by ID and store ID with data
export const updateItemIndex = async (itemIndexId, storeId, itemIndexData) => {
  try {
    const response = await fetch(`/itemIndex/${itemIndexId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...itemIndexData, store: storeId }),
    });
    if (!response.ok) throw new Error('Failed to update item index');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// delete item index by ID and store ID
export const deleteItemIndex = async (itemIndexId, storeId) => {
  try {
    const response = await fetch(`/itemIndex/${itemIndexId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ store: storeId }),
    });
    if (!response.ok) throw new Error('Failed to delete item index');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};


// search for index by upc
export const searchItemIndexByUpc = async (upc, storeId) => {
  try {
    const response = await fetch(`/itemIndex/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ upc, store: storeId }),
    });
    if (!response.ok) throw new Error('Failed to search item index');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};  
