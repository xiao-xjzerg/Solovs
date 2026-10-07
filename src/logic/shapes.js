import { clamp } from "./vector.js";
import { shapeCenter } from "./actors/actor.js";

export function ellipseRadiusToward(shape, dx, dy) {
  const rx = Math.max(0.5, shape.width * 0.5);
  const ry = Math.max(0.5, shape.height * 0.5);
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return Math.max(rx, ry);
  const ux = dx / length;
  const uy = dy / length;
  return 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
}

export function circleHitsActor(circle, actor) {
  const center = shapeCenter(actor, actor.hurtbox);
  const dx = center.x - circle.x;
  const dy = center.y - circle.y;
  const targetRadius = ellipseRadiusToward(actor.hurtbox, dx, dy);
  return Math.hypot(dx, dy) <= circle.radius + targetRadius;
}

export function arcHitsActor(arc, actor) {
  const center = shapeCenter(actor, actor.hurtbox);
  const dx = center.x - arc.x;
  const dy = center.y - arc.y;
  const distance = Math.hypot(dx, dy);
  const targetRadius = ellipseRadiusToward(actor.hurtbox, dx, dy);
  if (distance > arc.radius + targetRadius) return false;
  if (distance <= targetRadius) return true;
  const dot = clamp((dx / distance) * arc.direction.x + (dy / distance) * arc.direction.y, -1, 1);
  const angle = Math.acos(dot);
  const angularPadding = Math.asin(clamp(targetRadius / Math.max(distance, targetRadius), 0, 1));
  return angle <= (arc.angleRad * 0.5) + angularPadding;
}

export function ellipseIntersectsEllipse(actorA, shapeA, actorB, shapeB) {
  const a = shapeCenter(actorA, shapeA);
  const b = shapeCenter(actorB, shapeB);
  const rx = Math.max(1, (shapeA.width + shapeB.width) * 0.5);
  const ry = Math.max(1, (shapeA.height + shapeB.height) * 0.5);
  const nx = (b.x - a.x) / rx;
  const ny = (b.y - a.y) / ry;
  return nx * nx + ny * ny <= 1;
}

export function rectangleHitsActor(rectangle, actor) {
  const center = shapeCenter(actor, actor.hurtbox);
  const cos = Math.cos(-rectangle.rotation);
  const sin = Math.sin(-rectangle.rotation);
  const dx = center.x - rectangle.x;
  const dy = center.y - rectangle.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const rx = actor.hurtbox.width * 0.5;
  const ry = actor.hurtbox.height * 0.5;
  const nearestX = clamp(localX, -rectangle.width * 0.5, rectangle.width * 0.5);
  const nearestY = clamp(localY, -rectangle.height * 0.5, rectangle.height * 0.5);
  const ex = (localX - nearestX) / Math.max(rx, 1);
  const ey = (localY - nearestY) / Math.max(ry, 1);
  return ex * ex + ey * ey <= 1;
}
