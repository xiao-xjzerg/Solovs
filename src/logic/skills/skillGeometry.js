import { shapeCenter } from "../actors/actor.js";
import { normalize } from "../vector.js";

const ACTOR_REFERENCE_ALIASES = new Set(["actor", "self", "feet"]);

export function actorReferencePoint(actor, reference = "actor") {
  if (ACTOR_REFERENCE_ALIASES.has(reference)) {
    return { x: actor.x, y: actor.y };
  }
  if (reference === "body_center") return shapeCenter(actor, actor.body);
  if (reference === "hurtbox_center") return shapeCenter(actor, actor.hurtbox);
  if (reference === "display_center" && actor.display) {
    return {
      x: actor.x + actor.display.width * 0.5 - actor.display.anchorX,
      y: actor.y + actor.display.height * 0.5 - actor.display.anchorY
    };
  }
  return { x: actor.x, y: actor.y };
}

export function skillOriginReferencePoint(caster, params = {}) {
  const point = actorReferencePoint(caster, params.origin || "actor");
  return {
    x: point.x + (Number(params.originOffsetX) || 0),
    y: point.y + (Number(params.originOffsetY) || 0)
  };
}

export function skillTargetReferencePoint(target, params = {}) {
  return actorReferencePoint(target, params.targetReference || "actor");
}

export function skillAimGeometry(caster, target, params = {}, fallbackDirection = caster.facing) {
  const originReference = skillOriginReferencePoint(caster, params);
  const targetReference = skillTargetReferencePoint(target, params);
  const dx = targetReference.x - originReference.x;
  const dy = targetReference.y - originReference.y;
  return {
    originReference,
    targetReference,
    direction: normalize(dx, dy, fallbackDirection),
    distance: Math.hypot(dx, dy)
  };
}

export function skillOriginPoint(caster, params = {}, direction = caster.facing) {
  const reference = skillOriginReferencePoint(caster, params);
  const normalized = normalize(direction?.x, direction?.y, caster.facing);
  const forwardOffset = Number(params.originForwardOffset) || 0;
  return {
    x: reference.x + normalized.x * forwardOffset,
    y: reference.y + normalized.y * forwardOffset
  };
}
