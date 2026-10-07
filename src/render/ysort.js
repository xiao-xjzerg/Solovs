export function sortByY(items) {
  return items.slice().sort((a, b) => a.sortY - b.sortY || a.order - b.order);
}
