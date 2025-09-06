// create item
export const createItem = async (itemData) => {
  try {
    const response = await fetch('/item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemData),
    });
    if (!response.ok) throw new Error('Failed to create item');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// get item by ID
export const getItem = async (itemId) => {
  try {
    const response = await fetch(`/item/${itemId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to fetch item');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// update item by ID
export const updateItem = async (itemId, itemData) => {
  try {
    const response = await fetch(`/item/${itemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemData),
    });
    if (!response.ok) throw new Error('Failed to update item');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// delete item by ID
export const deleteItem = async (itemId) => {
  try {
    const response = await fetch(`/item/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to delete item');
    return await response.json();
  } catch (error) {
    console.error(error);
  }
};
