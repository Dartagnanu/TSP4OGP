import { apiJson } from '../auth/apiClient.js';

export const createStore = async (storeData) => {
  try {
    return await apiJson('/store', {
      method: 'POST',
      body: JSON.stringify(storeData),
    });
  } catch (error) {
    console.error(error);
  }
};

export const getStore = async (storeId) => {
  try {
    return await apiJson(`/store/${storeId}`);
  } catch (error) {
    console.error(error);
  }
};

export const updateStore = async (storeId, storeData) => {
  try {
    return await apiJson(`/store/${storeId}`, {
      method: 'PUT',
      body: JSON.stringify(storeData),
    });
  } catch (error) {
    console.error(error);
  }
};

export const deleteStore = async (storeId) => {
  try {
    return await apiJson(`/store/${storeId}`, { method: 'DELETE' });
  } catch (error) {
    console.error(error);
  }
};
