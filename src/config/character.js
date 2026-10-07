export const playerConfig = {
  id: "player",
  maxHp: 2000,
  moveSpeed: 235,
  body: {
    shape: "ellipse",
    width: 80,
    height: 30,
    offsetX: 0,
    offsetY: -15
  },
  hurtbox: {
    shape: "ellipse",
    width: 150,
    height: 160,
    offsetX: 0,
    offsetY: -90
  },
  targetArrivalRadius: 24,
  stuckEpsilon: 0.35,
  baseVisualScale: 0.4,
  baseReferenceScale: 0.5,
  stopDistance: 3,
  meleeRange: 156,
  autoAttackInterval: 1,
  initialDirection: "D",
  roll: {
    speed: 850,
    duration: 0.18,
    cooldown: 2
  }
};
