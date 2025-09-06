export function cloneShelf(shelfData) {
  const clonedShelf = { ...shelf, id: `shelf_${Date.now()}` };
  window.createAndAddShelf(clonedShelf);
}