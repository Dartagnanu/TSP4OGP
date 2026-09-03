import { apiJson } from '../auth/apiClient.js';

export const getPickwalksByStore = async (store_number) => {
  return apiJson(`/pickwalks/store/${store_number}`);
};
