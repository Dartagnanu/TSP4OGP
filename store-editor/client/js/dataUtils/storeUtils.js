// create store
export const createStore = async (storeData) => {
  try {
    const response = await fetch('/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(storeData),
    });
    if (!response.ok) throw new Error('Failed to create store');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// get store by ID
export const getStore = async (storeId) => {
  try {
    const response = await fetch(`/store/${storeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to fetch store');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// update store by ID
export const updateStore = async (storeId, storeData) => {
  try {
    const response = await fetch(`/store/${storeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(storeData),
    });
    if (!response.ok) throw new Error('Failed to update store');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// delete store by ID
export const deleteStore = async (storeId) => {
  try {
    const response = await fetch(`/store/${storeId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to delete store');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};
