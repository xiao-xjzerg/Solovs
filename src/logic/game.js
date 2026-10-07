import { playerConfig } from "../config/character.js";
import { combatFeelConfig } from "../config/combatFeel.js";
import { skillConfig } from "../config/skills.js";
import { createActor, applyActorDamage, shapeCenter } from "./actors/actor.js";
import { BossAI } from "./boss/bossAI.js";
import { resolveBodyAgainstBody, resolveBodyWorld } from "./collision.js";
import { resolveDirectionFromVector, vectorForDirection } from "./directions.js";
import { EffectSystem } from "./effects.js";
import { capsuleHitsActor, getHitCapsule, scaleRatioForPlayer } from "./hit.js";
import { ProjectileSystem } from "./projectiles.js";
import { createSkillHandlers } from "./skills/handlers.js";
import { SkillRuntime } from "./skills/skillRuntime.js";
import { SpawnerSystem } from "./spawners.js";
import { clonePoint, distance, normalize } from "./vector.js";

function playerAnimations(manifest) {
  const move = manifest.player.animations.move;
  const attack = manifest.player.animations.attack;
  return {
    player_move: {
      id: "player_move",
      action: "move",
      loop: true,
      loopStartFrame: 0,
      loopEndFrame: move.frameCount - 1,
      frames: Array.from({ length: move.frameCount }, (_, index) => ({
        index,
        durationMs: 1000 / move.fps
      }))
    },
    player_attack: {
      id: "player_attack",
      action: "attack",
      loop: false,
      loopStartFrame: null,
      loopEndFrame: null,
      frames: attack.frameDurationsMs.map((durationMs, index) => ({
        index,
        durationMs
      }))
    }
  };
}

function directionLabel(vector, fallback = "D") {
  return resolveDirectionFromVector(vector.x, vector.y, fallback);
}

export class Game {
  constructor({ manifest, scene, bossConfig }) {
    this.manifest = manifest;
    this.bossConfig = bossConfig;
    this.directionConfigs = manifest.player.directionConfigs;
    this.attackTimeline = manifest.player.animations.attack;
    this.world = {
      width: scene.width,
      height: scene.height,
      playBounds: scene.cameraBounds,
      visualBounds: scene.visualBounds || {
        x: 0,
        y: 0,
        width: scene.width,
        height: scene.height
      },
      colliders: scene.colliders || []
    };
    this.random = Math.random;
    this.events = [];
    this.telegraphs = [];
    this.debug = {
      showHitbox: false,
      showActorShapes: false,
      lastHit: null,
      lastBossShape: null
    };
    this.feedback = {
      hitStopT: 0,
      shakeT: 0,
      shakeDuration: combatFeelConfig.shake.duration
    };

    this.effectSystem = new EffectSystem();
    this.projectileSystem = new ProjectileSystem(bossConfig.projectiles);
    this.spawnerSystem = new SpawnerSystem();
    this.skillRuntime = new SkillRuntime(bossConfig, createSkillHandlers());

    const playerSpawn = scene.playerSpawn || { x: 1440, y: 1020 };
    this.player = createActor({
      id: "player",
      kind: "player",
      config: {
        ...playerConfig,
        display: manifest.player.displaySize,
        visualBounds: manifest.player.visualBounds,
        animations: { idle: "player_move", move: "player_move", attack: "player_attack" }
      },
      animations: playerAnimations(manifest),
      spawn: playerSpawn,
      initialAnimationId: "player_move"
    });
    const initialVector = vectorForDirection(this.directionConfigs, playerConfig.initialDirection);
    Object.assign(this.player, {
      visualScale: manifest.player.baseVisualScale,
      direction: playerConfig.initialDirection,
      attackDirection: playerConfig.initialDirection,
      lastMoveVector: { x: initialVector.x, y: initialVector.y },
      moveTarget: null,
      engagedTargetId: null,
      autoAttackTimer: 0,
      rollT: 0,
      rollVector: { x: initialVector.x, y: initialVector.y },
      cooldowns: { Q: 0, W: 0, E: 0, roll: 0 },
      notice: "",
      lastConfirm: null,
      hitResolved: false
    });
    this.player.animator.stop();

    this.actors = new Map([[this.player.id, this.player]]);
    this.bosses = [];
    const bossEntries = Object.values(bossConfig.bosses);
    const spawnRecords = scene.actorSpawns?.length
      ? scene.actorSpawns
      : bossEntries.slice(0, 1).map((boss, index) => ({
          actorId: boss.id,
          ...(scene.enemySpawns?.[index] || { x: 1940, y: 760 })
        }));

    for (const [index, spawn] of spawnRecords.entries()) {
      const config = bossConfig.bosses[spawn.actorId];
      if (!config) continue;
      const animations = Object.fromEntries(
        Object.entries(bossConfig.animations).filter(([, animation]) => animation.ownerId === config.id)
      );
      const actorId = index === 0 ? config.id : `${config.id}-${index + 1}`;
      const boss = createActor({
        id: actorId,
        kind: "boss",
        config,
        animations,
        spawn,
        initialAnimationId: config.animations.idle
      });
      boss.cooldowns = Object.fromEntries(Object.keys(bossConfig.skills).map(skillId => [skillId, 0]));
      boss.skillCast = null;
      boss.pendingChain = null;
      boss.ai = new BossAI(boss, config, this.skillRuntime);
      this.bosses.push(boss);
      this.actors.set(boss.id, boss);
    }
    this.primaryBoss = this.bosses[0] || null;
    for (const actor of this.actors.values()) {
      this.moveActor(actor, 0, 0);
      actor.homeX = actor.x;
      actor.homeY = actor.y;
    }
    this.outcome = null;
  }

  actorById(id) {
    return this.actors.get(id) || null;
  }

  consumeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  emit(type, payload = {}) {
    this.events.push({ type, ...payload });
  }

  selectableActorAt(point) {
    return this.bosses
      .filter(actor => actor.alive)
      .map(actor => {
        const center = shapeCenter(actor, actor.hurtbox);
        const radius = Math.max(actor.hurtbox.width, actor.hurtbox.height) * 0.55;
        return { actor, distance: Math.hypot(point.x - center.x, point.y - center.y), radius };
      })
      .filter(item => item.distance <= item.radius)
      .sort((a, b) => a.distance - b.distance)[0]?.actor || null;
  }

  handleSecondary(point) {
    const target = this.selectableActorAt(point);
    if (target) {
      this.player.engagedTargetId = target.id;
      this.player.moveTarget = null;
      this.player.autoAttackTimer = 0;
      this.player.notice = "";
      return;
    }
    this.moveTo(point);
  }

  handlePrimaryConfirm(point) {
    this.player.lastConfirm = clonePoint(point);
    this.player.notice = "Confirm";
    this.emit("confirm", { x: point.x, y: point.y });
    return true;
  }

  moveTo(point) {
    const arrivalDistance = Math.max(playerConfig.stopDistance, playerConfig.targetArrivalRadius);
    if (distance(point, this.player) <= arrivalDistance) {
      this.clearMoveTarget();
      return;
    }
    this.player.moveTarget = clonePoint(point);
    this.player.engagedTargetId = null;
    if (this.player.state !== "Rolling" && this.player.state !== "Attacking") {
      this.player.state = "Moving";
    }
  }

  clearMoveTarget() {
    this.player.moveTarget = null;
    if (this.player.state === "Moving") this.setPlayerIdle();
  }

  basicAttack() {
    if (this.player.cooldowns.Q > 0 || !this.player.alive) return false;
    const target = this.actorById(this.player.engagedTargetId) || this.closestLivingBoss();
    let direction = this.player.direction;
    if (target && (this.player.engagedTargetId || this.isBossInFrontRange(target))) {
      direction = this.directionToPoint(target);
    }
    return this.startPlayerAttack(direction);
  }

  activateReservedSkill(slot) {
    const config = skillConfig[slot];
    if (!config || config.kind !== "reserved" || !this.player.alive) return false;
    if (this.player.cooldowns[slot] > 0) return false;
    this.player.cooldowns[slot] = config.cooldown;
    this.player.notice = `${slot} reserved`;
    this.emit("notice", { message: this.player.notice });
    return true;
  }

  roll() {
    if (
      !this.player.alive ||
      this.player.cooldowns.roll > 0 ||
      this.player.state === "Rolling"
    ) {
      return false;
    }
    const vector = this.player.lastMoveVector;
    this.player.state = "Rolling";
    this.player.rollT = playerConfig.roll.duration;
    this.player.rollVector = { x: vector.x, y: vector.y };
    this.player.cooldowns.roll = playerConfig.roll.cooldown;
    this.player.engagedTargetId = null;
    this.player.moveTarget = null;
    this.player.notice = "";
    this.player.animator.play("player_move", { restart: true, speed: 1.4 });
    return true;
  }

  directionToPoint(point) {
    return resolveDirectionFromVector(
      point.x - this.player.x,
      point.y - this.player.y,
      this.player.direction
    );
  }

  closestLivingBoss() {
    return this.bosses
      .filter(actor => actor.alive)
      .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0] || null;
  }

  isBossInFrontRange(boss) {
    return distance(this.player, boss) <= playerConfig.meleeRange + 80;
  }

  startPlayerAttack(direction) {
    if (
      this.player.state === "Attacking" ||
      this.player.state === "Rolling" ||
      !this.player.alive
    ) {
      return false;
    }
    this.player.state = "Attacking";
    this.player.attackDirection = direction;
    this.player.direction = direction;
    this.player.moveTarget = null;
    this.player.hitResolved = false;
    this.player.animator.play("player_attack", { restart: true });
    return true;
  }

  update(dt) {
    this.events = [];
    const safeDt = Math.min(dt, 0.05);
    const dtMs = safeDt * 1000;
    this.updateCooldowns(dtMs);
    this.updateTransientTimers(safeDt, dtMs);

    if (this.feedback.hitStopT > 0) {
      this.feedback.hitStopT = Math.max(0, this.feedback.hitStopT - safeDt);
      return this.consumeEvents();
    }

    this.updateActorVelocities(safeDt);
    this.updatePlayer(safeDt, dtMs);
    for (const boss of this.bosses) {
      boss.ai.update(dtMs, this);
      const animationEvents = boss.animator.update(dtMs);
      this.skillRuntime.update(boss, dtMs, animationEvents, this);
    }
    this.projectileSystem.update(safeDt, this);
    this.spawnerSystem.update(dtMs, this);
    this.updateOutcome();

    if (this.debug.lastBossShape) {
      this.debug.lastBossShape.life -= safeDt;
      if (this.debug.lastBossShape.life <= 0) this.debug.lastBossShape = null;
    }
    return this.consumeEvents();
  }

  updateCooldowns(dtMs) {
    for (const actor of this.actors.values()) {
      for (const key of Object.keys(actor.cooldowns)) {
        const unit = actor.kind === "player" ? dtMs / 1000 : dtMs;
        actor.cooldowns[key] = Math.max(0, actor.cooldowns[key] - unit);
      }
    }
  }

  updateTransientTimers(dt, dtMs) {
    this.feedback.shakeT = Math.max(0, this.feedback.shakeT - dt);
    for (const actor of this.actors.values()) {
      actor.flashT = Math.max(0, actor.flashT - dt);
      actor.hurtT = Math.max(0, actor.hurtT - dt);
      this.effectSystem.update(actor, dtMs);
    }
  }

  updateActorVelocities(dt) {
    for (const actor of this.actors.values()) {
      const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
      if (speed <= 0.01) {
        actor.velocity.x = 0;
        actor.velocity.y = 0;
        continue;
      }
      this.moveActor(actor, actor.velocity.x * dt, actor.velocity.y * dt);
      const nextSpeed = Math.max(0, speed - combatFeelConfig.knockback.deceleration * dt);
      const ratio = speed > 0 ? nextSpeed / speed : 0;
      actor.velocity.x *= ratio;
      actor.velocity.y *= ratio;
    }
  }

  updatePlayer(dt, dtMs) {
    const player = this.player;
    if (!player.alive) {
      player.state = "Dead";
      return;
    }
    if (player.state === "Attacking") {
      const events = player.animator.update(dtMs);
      for (const event of events) {
        if (event.type === "animationFrame") this.enterPlayerAttackFrame(event.frame);
        if (event.type === "animationComplete") {
          player.state = player.engagedTargetId ? "Engaged" : "Idle";
          this.setPlayerIdle();
        }
      }
      return;
    }
    if (player.state === "Rolling") {
      this.updateRoll(dt, dtMs);
      return;
    }
    if (player.engagedTargetId) {
      this.updateEngagement(dt, dtMs);
      return;
    }
    if (player.moveTarget) {
      const moved = this.movePlayerToward(
        player.moveTarget,
        dt,
        dtMs,
        playerConfig.stopDistance,
        { useArrivalRadius: true }
      );
      if (!moved) this.setPlayerIdle();
      return;
    }
    this.setPlayerIdle();
  }

  updateEngagement(dt, dtMs) {
    const target = this.actorById(this.player.engagedTargetId);
    if (!target?.alive) {
      this.player.engagedTargetId = null;
      this.setPlayerIdle();
      return;
    }
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    this.player.direction = resolveDirectionFromVector(dx, dy, this.player.direction);

    if (dist > playerConfig.meleeRange) {
      const moved = this.movePlayerToward(target, dt, dtMs, playerConfig.meleeRange - 8);
      if (!moved) this.player.state = "Engaged";
      return;
    }

    this.player.state = "Engaged";
    this.resetPlayerMoveFrame();
    this.player.autoAttackTimer -= dt;
    if (this.player.autoAttackTimer <= 0) {
      this.startPlayerAttack(this.directionToPoint(target));
      this.player.autoAttackTimer = playerConfig.autoAttackInterval;
    }
  }

  movePlayerToward(target, dt, dtMs, stopDistance, options = {}) {
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const arrivalDistance = options.useArrivalRadius
      ? Math.max(stopDistance, playerConfig.targetArrivalRadius)
      : stopDistance;
    if (dist <= arrivalDistance) {
      if (options.useArrivalRadius) this.clearMoveTarget();
      return false;
    }

    const vector = normalize(dx, dy, this.player.lastMoveVector);
    const speed =
      playerConfig.moveSpeed *
      this.effectSystem.moveSpeedMultiplier(this.player);
    const step = Math.min(Math.max(0, dist - stopDistance), speed * dt);
    this.player.direction = resolveDirectionFromVector(vector.x, vector.y, this.player.direction);
    this.player.lastMoveVector = { x: vector.x, y: vector.y };
    this.player.facing = { x: vector.x, y: vector.y, label: this.player.direction };
    this.player.state = "Moving";
    this.player.animator.play("player_move");
    this.player.animator.update(dtMs);

    const before = { x: this.player.x, y: this.player.y };
    this.moveActor(this.player, vector.x * step, vector.y * step);
    const movedDistance = Math.hypot(this.player.x - before.x, this.player.y - before.y);
    const remaining = Math.hypot(target.x - this.player.x, target.y - this.player.y);
    if (
      options.useArrivalRadius &&
      movedDistance < playerConfig.stuckEpsilon &&
      remaining <= playerConfig.targetArrivalRadius * 2
    ) {
      this.clearMoveTarget();
      return false;
    }
    return true;
  }

  moveActor(actor, dx, dy) {
    const frameScale = actor.animator?.frame?.visualScale || 1;
    const visualScale = (actor.flags.phaseScale || 1) * frameScale;
    let next = resolveBodyWorld(
      { x: actor.x + dx, y: actor.y + dy },
      actor.body,
      this.world,
      actor.visualBounds,
      visualScale
    );
    for (const other of this.actors.values()) {
      if (other === actor || !other.alive) continue;
      next = resolveBodyAgainstBody(next, actor.body, other);
    }
    next = resolveBodyWorld(
      next,
      actor.body,
      this.world,
      actor.visualBounds,
      visualScale
    );
    actor.x = next.x;
    actor.y = next.y;
  }

  updateRoll(dt, dtMs) {
    const stepDt = Math.min(dt, this.player.rollT);
    this.moveActor(
      this.player,
      this.player.rollVector.x * playerConfig.roll.speed * stepDt,
      this.player.rollVector.y * playerConfig.roll.speed * stepDt
    );
    this.player.rollT = Math.max(0, this.player.rollT - dt);
    this.player.direction = directionLabel(this.player.rollVector, this.player.direction);
    this.player.animator.update(dtMs * 1.4);
    this.emit("rollGhost", {
      x: this.player.x,
      y: this.player.y,
      direction: this.player.direction,
      frame: this.player.animator.frameIndex,
      scale: this.player.visualScale,
      life: 0.18
    });
    if (this.player.rollT <= 0) this.setPlayerIdle();
  }

  setPlayerIdle() {
    if (this.player.state !== "Engaged") this.player.state = "Idle";
    this.resetPlayerMoveFrame();
  }

  resetPlayerMoveFrame() {
    if (this.player.animator.animationId !== "player_move" || this.player.animator.frameIndex !== 0) {
      this.player.animator.play("player_move", { restart: true });
    }
    this.player.animator.stop();
  }

  enterPlayerAttackFrame(frame) {
    if (frame === 3 || frame === 4) {
      this.emit("slashTrail", {
        frame,
        direction: this.player.attackDirection,
        x: this.player.x,
        y: this.player.y,
        scale: this.player.visualScale,
        life: frame === 3 ? 0.11 : 0.15
      });
    }
    if (frame === this.attackTimeline.hitFrame) this.resolvePlayerAttackHit();
  }

  resolvePlayerAttackHit() {
    if (this.player.hitResolved) return false;
    this.player.hitResolved = true;
    const directionConfig = this.directionConfigs[this.player.attackDirection];
    const capsule = getHitCapsule(this.player, directionConfig, combatFeelConfig, playerConfig);
    this.debug.lastHit = capsule;
    const target = this.bosses.find(actor => actor.alive && capsuleHitsActor(capsule, actor));
    if (!target) return false;

    const direction = directionConfig.vector;
    const targetCenter = shapeCenter(target, target.hurtbox);
    const scaleRatio = capsule.scaleRatio;
    this.feedback.hitStopT = combatFeelConfig.hitstop.duration;
    this.feedback.shakeT = combatFeelConfig.shake.duration;
    target.velocity.x = direction.x * combatFeelConfig.knockback.power * scaleRatio;
    target.velocity.y = direction.y * combatFeelConfig.knockback.power * scaleRatio;
    this.damageActor(target, combatFeelConfig.hit.damage, this.player, []);
    this.emit("hit", {
      x: targetCenter.x - direction.x * 24,
      y: targetCenter.y - direction.y * 24,
      direction: { x: direction.x, y: direction.y },
      scaleRatio
    });
    return true;
  }

  damageActor(target, amount, source, effects = []) {
    if (!target?.alive) return 0;
    const applied = applyActorDamage(target, Number(amount) || 0);
    for (const effect of effects) this.effectSystem.apply(target, effect, source || target);
    if (applied > 0) {
      this.emit("actorDamaged", {
        actorId: target.id,
        sourceId: source?.id || null,
        amount: applied,
        hp: target.hp
      });
    }
    if (!target.alive) {
      this.emit("actorDefeated", { actorId: target.id, sourceId: source?.id || null });
    }
    return applied;
  }

  handleSkillEvent(cast, event, frame) {
    if (event.eventType === "projectile_spawn") {
      this.projectileSystem.spawn(
        event.refId,
        cast.caster,
        cast.targetLocation,
        cast.skill,
        cast.effects
      );
    }
    if (event.eventType === "camera_shake") {
      const vfx = this.bossConfig.vfx[event.refId];
      this.feedback.shakeT = Math.max(
        this.feedback.shakeT,
        (Number(vfx?.durationMs) || 250) / 1000
      );
      this.feedback.shakeDuration = this.feedback.shakeT;
    }
    this.emit("skillEvent", {
      actorId: cast.caster.id,
      skillId: cast.skill.id,
      eventId: event.id,
      eventType: event.eventType,
      refId: event.refId,
      attachTo: event.attachTo,
      frame,
      x: cast.caster.x,
      y: cast.caster.y
    });
  }

  updateOutcome() {
    if (!this.player.alive && this.outcome !== "defeat") {
      this.outcome = "defeat";
      this.emit("outcome", { result: "defeat" });
    } else if (this.bosses.length && this.bosses.every(actor => !actor.alive) && this.outcome !== "victory") {
      this.outcome = "victory";
      this.player.engagedTargetId = null;
      this.emit("outcome", { result: "victory" });
    }
  }

  getHitCapsuleForRender() {
    const direction =
      this.player.state === "Attacking"
        ? this.player.attackDirection
        : this.player.direction;
    return getHitCapsule(
      this.player,
      this.directionConfigs[direction],
      combatFeelConfig,
      playerConfig
    );
  }

  runSelfTests() {
    const failures = [];
    const expect = (condition, message) => {
      if (!condition) failures.push(message);
    };
    expect(
      JSON.stringify(this.attackTimeline.frameDurationsMs) === "[105,105,145,45,65,175]",
      "player attack frame timings changed"
    );
    expect(this.attackTimeline.hitFrame === 4, "player attack hit frame must be 4");
    expect(playerConfig.body.width === 80 && playerConfig.body.height === 30, "player body mismatch");
    expect(
      playerConfig.hurtbox.width === 150 && playerConfig.hurtbox.height === 160,
      "player hurtbox mismatch"
    );
    expect(this.bosses.length > 0, "no boss spawned from scene/config");
    expect(this.skillRuntime.supports("melee"), "melee handler missing");
    expect(
      Object.values(this.bossConfig.skills)
        .filter(skill => skill.handler === "sequence")
        .every(skill => this.skillRuntime.supports(skill.id)),
      "sequence handler missing"
    );
    for (const direction of this.manifest.player.directionOrder) {
      expect(Boolean(this.directionConfigs[direction]), `missing player direction ${direction}`);
    }
    return { ok: failures.length === 0, failures };
  }
}
