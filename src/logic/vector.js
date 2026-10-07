export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function length(x, y) {
  return Math.hypot(x, y);
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

export function normalize(x, y, fallback = { x: 0, y: 1 }) {
  const len = Math.hypot(x, y);
  if (len < 0.0001) return { x: fallback.x, y: fallback.y };
  return { x: x / len, y: y / len };
}

export function scale(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function clonePoint(point) {
  return { x: point.x, y: point.y };
}
