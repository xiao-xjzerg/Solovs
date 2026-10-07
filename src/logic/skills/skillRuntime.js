import { skillAimGeometry } from "./skillGeometry.js";

export class SkillRuntime {
  constructor(config, handlers) {
    this.config = config;
    this.handlers = handlers;
    this.nextCastId = 1;
  }

  supports(skillId) {
    const skill = this.config.skills[skillId];
    return Boolean(skill && this.handlers.has(skill.handler));
  }

  start(caster, skillId, target, world, { ignoreCooldown = false } = {}) {
    const skill = this.config.skills[skillId];
    const handler = this.handlers.get(skill?.handler);
    if (!skill || !handler || caster.skillCast || !caster.alive) return false;
    if (!ignoreCooldown && (caster.cooldowns[skillId] || 0) > 0) return false;

    const targetLocation = { x: target.x, y: target.y };
    const aim = skillAimGeometry(caster, target, skill.params, caster.facing);
    const direction = aim.direction;
    const effects = skill.effectIds
      .map(effectId => this.config.skillEffects[effectId])
      .filter(Boolean);
    const cast = {
      id: this.nextCastId++,
      caster,
      skill,
      handler,
      targetLocation,
      direction,
      effects,
      elapsedMs: 0,
      hitApplied: false,
      requestFinish: false
    };
    caster.skillCast = cast;
    caster.cooldowns[skillId] = Number(skill.cooldownMs) || 0;
    caster.state = "Skill";
    caster.facing = {
      x: direction.x,
      y: direction.y,
      label: Math.abs(direction.x) > Math.abs(direction.y)
        ? direction.x < 0 ? "L" : "R"
        : direction.y < 0 ? "U" : "D"
    };
    caster.animator.play(skill.animationId, { restart: true });
    handler.start?.(cast, world);
    this.emitTriggeredEvents(cast, "cast_start", null, world);
    world.emit("skillStart", { actorId: caster.id, skillId });
    return true;
  }

  update(caster, dtMs, animationEvents, world) {
    const cast = caster.skillCast;
    if (!cast) return;
    cast.elapsedMs += dtMs;

    for (const event of animationEvents) {
      if (event.type === "animationFrame") {
        cast.handler.onFrame?.(cast, event.frame, world);
        this.emitFrameEvents(cast, event.frame, world);
      }
      if (event.type === "animationComplete") cast.requestFinish = true;
    }
    cast.handler.update?.(cast, dtMs, world);
    if (cast.requestFinish) this.finish(caster, world);
  }

  emitFrameEvents(cast, frame, world) {
    for (const eventId of cast.skill.eventIds) {
      const event = this.config.skillEvents[eventId];
      if (!event) continue;
      const enterFrame = event.trigger === "enter_frame" && event.frameStart === frame;
      const frameRange =
        event.trigger === "frame_range" &&
        frame >= event.frameStart &&
        frame <= event.frameEnd;
      if (enterFrame || frameRange) world.handleSkillEvent(cast, event, frame);
    }
  }

  emitTriggeredEvents(cast, trigger, payload, world) {
    for (const eventId of cast.skill.eventIds) {
      const event = this.config.skillEvents[eventId];
      if (event?.trigger === trigger) world.handleSkillEvent(cast, event, payload);
    }
  }

  finish(caster, world) {
    const cast = caster.skillCast;
    if (!cast) return;
    cast.handler.finish?.(cast, world);
    this.emitTriggeredEvents(cast, "skill_end", null, world);
    caster.skillCast = null;
    caster.pendingChain = cast.skill.chain || null;
    caster.state = caster.alive ? "Engaged" : "Dead";
    world.emit("skillEnd", {
      actorId: caster.id,
      skillId: cast.skill.id,
      chain: cast.skill.chain
    });
  }
}
