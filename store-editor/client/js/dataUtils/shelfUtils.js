// create shelf
export const createShelf = async (shelfData) => {
  const response = await fetch('/shelf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(shelfData),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create shelf');
  }
  return await response.json();
};

// clone shelf and duplicate itemindex locations from source
export const cloneShelf = async (sourceShelfName, newShelfData) => {
  const response = await fetch(`/shelf/${encodeURIComponent(sourceShelfName)}/clone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(newShelfData),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to clone shelf');
  }
  return await response.json();
};

// get shelf by ID and store ID
export const getShelf = async (shelfId, store_number) => {

  try {
    const response = await fetch(`/shelf/${shelfId}?store=${store_number}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to fetch shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// update shelf with shelf data and store_number
export const updateShelf = async (shelfData, store_number) => {
  try {
    console.log('Updating shelf:', shelfData.shelf_name, 'for store:', store_number);
    const response = await fetch(`/shelf/${shelfData.shelf_name}/store/${store_number}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...shelfData, store_number }), // Include store_number in the body
    });
    if (!response.ok) throw new Error('Failed to update shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
};

// update shelf using old shelf name to find it, then update with new data
export const updateShelfByOldName = async (oldShelfName, newShelfData, store_number) => {
  try {
    console.log('Updating shelf using old name:', oldShelfName, 'with new data:', newShelfData, 'for store:', store_number);
    const response = await fetch(`/shelf/${oldShelfName}/store/${store_number}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...newShelfData, store_number }), // Include store_number in the body
    });
    if (!response.ok) throw new Error('Failed to update shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
};



// delete shelf by name and store ID
export const deleteShelf = async (shelf_name, store_number) => {
  try {
    const response = await fetch(`/shelf/${shelf_name}/store/${store_number}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    if (!response.ok) throw new Error('Failed to delete shelf');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};


// get all shelves by store_number returns array of shelves
export const getShelvesByStore = async (store_number) => {

  try {
    console.log(`Sending request to fetch shelves for store_number: ${store_number}`); // Debug log
    const response = await fetch(`/shelves?store=${store_number}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch shelves for store: ${store_number}`);
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};