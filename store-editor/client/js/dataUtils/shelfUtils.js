// create shelf
export const createShelf = async (shelfData) => {
  try {
    const response = await fetch('/shelf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(shelfData),
    });
    if (!response.ok) throw new Error('Failed to create shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// get shelf by ID and store ID
export const getShelf = async (shelfId, storeId) => {
  try {
    const response = await fetch(`/shelf/${shelfId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ store: storeId }),
    });
    if (!response.ok) throw new Error('Failed to fetch shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// update shelf with shelf data 
export const updateShelf = async (shelfData) => {
  try {
    const response = await fetch(`/shelf/${shelfData.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...shelfData, store: shelfData.store }),
    });
    if (!response.ok) throw new Error('Failed to update shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// delete shelf by ID 
export const deleteShelf = async (shelfData) => {
  try {
    const response = await fetch(`/shelf/${shelfData.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ store: shelfData.store }),
    });
    if (!response.ok) throw new Error('Failed to delete shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};
