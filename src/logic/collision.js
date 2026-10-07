import { clamp } from "./vector.js";

function resolveCircleRect(point, radius, rect) {
  const nearestX = clamp(point.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(point.y, rect.y, rect.y + rect.height);
  let dx = point.x - nearestX;
  let dy = point.y - nearestY;
  let dist = Math.hypot(dx, dy);

  if (dist >= radius) return point;

  if (dist < 0.0001) {
    const left = Math.abs(point.x - rect.x);
    const right = Math.abs(rect.x + rect.width - point.x);
    const top = Math.abs(point.y - rect.y);
    const bottom = Math.abs(rect.y + rect.height - point.y);
    const min = Math.min(left, right, top, bottom);
    if (min === left) return { x: rect.x - radius, y: point.y };
    if (min === right) return { x: rect.x + rect.width + radius, y: point.y };
    if (min === top) return { x: point.x, y: rect.y - radius };
    return { x: point.x, y: rect.y + rect.height + radius };
  }

  const push = radius - dist;
  dx /= dist;
  dy /= dist;
  return { x: point.x + dx * push, y: point.y + dy * push };
}

function resolveCircleEllipse(point, radius, ellipse) {
  const rx = ellipse.width * 0.5;
  const ry = ellipse.height * 0.5;
  const cx = ellipse.x + rx;
  const cy = ellipse.y + ry;

  const expandedRx = Math.max(rx + radius, 1);
  const expandedRy = Math.max(ry + radius, 1);
  const dx = point.x - cx;
  const dy = point.y - cy;
  const normalizedX = dx / expandedRx;
  const normalizedY = dy / expandedRy;
  const normalizedDistance = Math.hypot(normalizedX, normalizedY);

  if (normalizedDistance >= 1) return point;

  if (normalizedDistance < 0.0001) {
    return expandedRx < expandedRy
      ? { x: cx + expandedRx, y: cy }
      : { x: cx, y: cy - expandedRy };
  }

  const push = 1 / normalizedDistance;
  return {
    x: cx + dx * push,
    y: cy + dy * push
  };
}

export function resolveCircleWorld(point, radius, world) {
  let resolved = { x: point.x, y: point.y };
  const bounds = world.playBounds || { x: 0, y: 0, width: world.width, height: world.height };

  resolved.x = clamp(resolved.x, bounds.x + radius, bounds.x + bounds.width - radius);
  resolved.y = clamp(resolved.y, bounds.y + radius, bounds.y + bounds.height - radius);

  for (const collider of world.colliders || []) {
    if (collider.shape === "ellipse") {
      resolved = resolveCircleEllipse(resolved, radius, collider);
    } else {
      resolved = resolveCircleRect(resolved, radius, collider);
    }
  }

  resolved.x = clamp(resolved.x, bounds.x + radius, bounds.x + bounds.width - radius);
  resolved.y = clamp(resolved.y, bounds.y + radius, bounds.y + bounds.height - radius);
  return resolved;
}

function resolveEllipseRect(center, rx, ry, rect) {
  const nearestX = clamp(center.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(center.y, rect.y, rect.y + rect.height);
  let dx = center.x - nearestX;
  let dy = center.y - nearestY;

  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
    const candidates = [
      { value: Math.abs(center.x - rect.x), point: { x: rect.x - rx, y: center.y } },
      { value: Math.abs(rect.x + rect.width - center.x), point: { x: rect.x + rect.width + rx, y: center.y } },
      { value: Math.abs(center.y - rect.y), point: { x: center.x, y: rect.y - ry } },
      { value: Math.abs(rect.y + rect.height - center.y), point: { x: center.x, y: rect.y + rect.height + ry } }
    ];
    candidates.sort((a, b) => a.value - b.value);
    return candidates[0].point;
  }

  const normalizedDistance = Math.hypot(dx / rx, dy / ry);
  if (normalizedDistance >= 1) return center;
  dx /= normalizedDistance;
  dy /= normalizedDistance;
  return {
    x: nearestX + dx,
    y: nearestY + dy
  };
}

function resolveEllipseEllipse(center, rx, ry, ellipse) {
  const otherRx = ellipse.width * 0.5;
  const otherRy = ellipse.height * 0.5;
  const other = { x: ellipse.x + otherRx, y: ellipse.y + otherRy };
  const expandedRx = Math.max(1, rx + otherRx);
  const expandedRy = Math.max(1, ry + otherRy);
  const dx = center.x - other.x;
  const dy = center.y - other.y;
  const normalizedDistance = Math.hypot(dx / expandedRx, dy / expandedRy);
  if (normalizedDistance >= 1) return center;
  if (normalizedDistance < 0.0001) return { x: other.x + expandedRx, y: other.y };
  return {
    x: other.x + dx / normalizedDistance,
    y: other.y + dy / normalizedDistance
  };
}

export function resolveBodyWorld(
  point,
  body,
  world,
  visualBounds = null,
  visualScale = 1
) {
  const rx = Math.max(0.5, body.width * 0.5);
  const ry = Math.max(0.5, body.height * 0.5);
  const offsetX = body.offsetX || 0;
  const offsetY = body.offsetY || 0;
  const bounds = world.playBounds || { x: 0, y: 0, width: world.width, height: world.height };
  const visualLimitY = Number(world.visualBounds?.y) || 0;
  const visualTopExtent =
    Math.max(0, Number(visualBounds?.top) || 0) *
    Math.max(0, Number(visualScale) || 1);
  const minimumCenterY = Math.max(
    bounds.y + ry,
    visualLimitY + visualTopExtent + offsetY
  );
  let center = {
    x: point.x + offsetX,
    y: point.y + offsetY
  };

  center.x = clamp(center.x, bounds.x + rx, bounds.x + bounds.width - rx);
  center.y = clamp(center.y, minimumCenterY, bounds.y + bounds.height - ry);
  for (const collider of world.colliders || []) {
    center = collider.shape === "ellipse"
      ? resolveEllipseEllipse(center, rx, ry, collider)
      : resolveEllipseRect(center, rx, ry, collider);
  }
  center.x = clamp(center.x, bounds.x + rx, bounds.x + bounds.width - rx);
  center.y = clamp(center.y, minimumCenterY, bounds.y + bounds.height - ry);
  return {
    x: center.x - offsetX,
    y: center.y - offsetY
  };
}

export function resolveBodyAgainstBody(point, body, obstacleActor) {
  const rx = Math.max(1, (body.width + obstacleActor.body.width) * 0.5);
  const ry = Math.max(1, (body.height + obstacleActor.body.height) * 0.5);
  const moverCenter = {
    x: point.x + (body.offsetX || 0),
    y: point.y + (body.offsetY || 0)
  };
  const obstacleCenter = {
    x: obstacleActor.x + (obstacleActor.body.offsetX || 0),
    y: obstacleActor.y + (obstacleActor.body.offsetY || 0)
  };
  const dx = moverCenter.x - obstacleCenter.x;
  const dy = moverCenter.y - obstacleCenter.y;
  const normalized = Math.hypot(dx / rx, dy / ry);
  if (normalized >= 1) return point;
  if (normalized < 0.0001) {
    return { x: point.x + rx, y: point.y };
  }
  return {
    x: point.x + dx * (1 / normalized - 1),
    y: point.y + dy * (1 / normalized - 1)
  };
}
