import { clamp, dot } from "./vector.js";
import { ellipseRadiusToward } from "./shapes.js";
import { shapeCenter } from "./actors/actor.js";

export function scaleRatioForPlayer(player, playerConfig) {
  return player.visualScale / playerConfig.baseReferenceScale;
}

export function getHitCapsule(player, directionConfig, combatConfig, playerConfig) {
  const scaleRatio = scaleRatioForPlayer(player, playerConfig);
  const frontOffset = combatConfig.hit.frontOffset * scaleRatio;
  const radius = combatConfig.hit.thickness * scaleRatio * 0.5;
  const farEdgeDistance = combatConfig.hit.farEdge * scaleRatio;
  const startDistance = frontOffset + radius;
  const endDistance = Math.max(startDistance, farEdgeDistance - radius);
  const origin = {
    x: player.x + directionConfig.hitOriginOffset.x * scaleRatio,
    y: player.y + directionConfig.hitOriginOffset.y * scaleRatio
  };
  const vector = directionConfig.vector;

  return {
    direction: directionConfig.name,
    vector,
    origin,
    start: {
      x: origin.x + vector.x * startDistance,
      y: origin.y + vector.y * startDistance
    },
    end: {
      x: origin.x + vector.x * endDistance,
      y: origin.y + vector.y * endDistance
    },
    radius,
    frontOffset,
    farEdgeDistance,
    scaleRatio
  };
}

export function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq,
    0,
    1
  );
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

export function capsuleHitsTarget(capsule, target, targetConfig) {
  const targetCenter = {
    x: target.x,
    y: target.y + targetConfig.torsoOffsetY * capsule.scaleRatio
  };
  const dx = targetCenter.x - capsule.origin.x;
  const dy = targetCenter.y - capsule.origin.y;
  const forwardDistance = dot(dx, dy, capsule.vector.x, capsule.vector.y);
  if (forwardDistance < capsule.frontOffset) return false;

  const segmentDistance = distancePointToSegment(
    targetCenter,
    capsule.start,
    capsule.end
  );
  return segmentDistance <= capsule.radius + target.radius;
}

export function capsuleHitsActor(capsule, target) {
  const targetCenter = shapeCenter(target, target.hurtbox);
  const dx = targetCenter.x - capsule.origin.x;
  const dy = targetCenter.y - capsule.origin.y;
  const forwardDistance = dot(dx, dy, capsule.vector.x, capsule.vector.y);
  if (forwardDistance < capsule.frontOffset) return false;
  const segmentDistance = distancePointToSegment(targetCenter, capsule.start, capsule.end);
  const targetRadius = ellipseRadiusToward(target.hurtbox, dx, dy);
  return segmentDistance <= capsule.radius + targetRadius;
}
