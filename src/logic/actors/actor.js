import { Animator } from "../animator.js";

function cloneShape(shape) {
  return {
    shape: shape.shape || "ellipse",
    width: Number(shape.width) || 1,
    height: Number(shape.height) || 1,
    offsetX: Number(shape.offsetX) || 0,
    offsetY: Number(shape.offsetY) || 0
  };
}

function cloneVisualBounds(bounds, display) {
  return {
    top: Math.max(0, Number(bounds?.top ?? display?.anchorY) || 0)
  };
}

export function createActor({
  id,
  kind,
  config,
  animations,
  spawn,
  initialAnimationId = null
}) {
  const maxHp = Number(config.maxHp) || 1;
  return {
    id,
    configId: config.id || id,
    kind,
    x: spawn.x,
    y: spawn.y,
    homeX: spawn.x,
    homeY: spawn.y,
    hp: maxHp,
    maxHp,
    moveSpeed: Number(config.moveSpeed) || 0,
    body: cloneShape(config.body),
    hurtbox: cloneShape(config.hurtbox),
    facing: { x: 0, y: 1, label: "D" },
    velocity: { x: 0, y: 0 },
    state: "Idle",
    alive: true,
    target: null,
    cooldowns: {},
    debuffs: [],
    flashT: 0,
    hurtT: 0,
    display: config.display || null,
    visualBounds: cloneVisualBounds(config.visualBounds, config.display),
    animationRoles: config.animations || {},
    animator: new Animator(animations, initialAnimationId),
    controller: null,
    flags: {}
  };
}

export function shapeCenter(actor, shape) {
  return {
    x: actor.x + (shape.offsetX || 0),
    y: actor.y + (shape.offsetY || 0)
  };
}

export function applyActorDamage(actor, amount) {
  if (!actor.alive || amount <= 0) return 0;
  const applied = Math.min(actor.hp, amount);
  actor.hp = Math.max(0, actor.hp - applied);
  actor.flashT = Math.max(actor.flashT, 0.075);
  actor.hurtT = Math.max(actor.hurtT, 0.2);
  if (actor.hp <= 0) {
    actor.alive = false;
    actor.state = "Dead";
  }
  return applied;
}

export function actorHpRatio(actor) {
  return actor.maxHp > 0 ? Math.max(0, actor.hp / actor.maxHp) : 0;
}
