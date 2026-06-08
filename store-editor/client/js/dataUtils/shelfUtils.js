import { apiJson } from '../auth/apiClient.js';

export const createShelf = async (shelfData) => {
  return apiJson('/shelf', {
    method: 'POST',
    body: JSON.stringify(shelfData),
  });
};

export const cloneShelf = async (sourceShelfName, newShelfData) => {
  return apiJson(`/shelf/${encodeURIComponent(sourceShelfName)}/clone`, {
    method: 'POST',
    body: JSON.stringify(newShelfData),
  });
};

export const getShelf = async (shelfId, store_number) => {
  try {
    return await apiJson(`/shelf/${shelfId}?store=${store_number}`);
  } catch (error) {
    console.error(error);
  }
};

export const updateShelf = async (shelfData, store_number) => {
  return apiJson(`/shelf/${shelfData.shelf_name}/store/${store_number}`, {
    method: 'PUT',
    body: JSON.stringify({ ...shelfData, store_number }),
  });
};

export const updateShelfByOldName = async (oldShelfName, newShelfData, store_number) => {
  return apiJson(`/shelf/${oldShelfName}/store/${store_number}`, {
    method: 'PUT',
    body: JSON.stringify({ ...newShelfData, store_number }),
  });
};

export const deleteShelf = async (shelf_name, store_number) => {
  try {
    return await apiJson(`/shelf/${shelf_name}/store/${store_number}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error(error);
  }
};

export const getShelvesByStore = async (store_number) => {
  try {
    return await apiJson(`/shelves?store=${store_number}`);
  } catch (error) {
    console.error(error);
  }
};
