import { skillAimGeometry } from "../skills/skillGeometry.js";

function phaseMatches(phase, hpPct) {
  const aboveMin = phase.minInclusive ? hpPct >= phase.hpMinPct : hpPct > phase.hpMinPct;
  const belowMax = phase.maxInclusive ? hpPct <= phase.hpMaxPct : hpPct < phase.hpMaxPct;
  return aboveMin && belowMax;
}

function weightedChoice(items, random) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0] || null;
  let cursor = random() * total;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1] || null;
}

export class BossAI {
  constructor(actor, config, skillRuntime) {
    this.actor = actor;
    this.config = config;
    this.skillRuntime = skillRuntime;
    this.state = "Dormant";
    this.phase = config.phases.find(item => item.phase === config.initialPhase) || config.phases[0];
    this.phaseShiftMs = 0;
    this.phaseShiftCast = false;
    this.thinkCooldownMs = 0;
    this.actor.phase = this.phase?.phase || 1;
  }

  playRole(role, { restart = false } = {}) {
    const animationId = this.actor.animationRoles[role];
    if (!animationId) return false;
    return this.actor.animator.play(animationId, { restart });
  }

  update(dtMs, world) {
    const boss = this.actor;
    const player = world.player;
    if (!boss.alive) {
      this.state = "Dead";
      boss.state = "Dead";
      if (!this.playRole("death")) {
        this.playRole("hurt");
        boss.animator.stop();
      }
      return;
    }

    this.updatePhase(world);
    if (this.state === "PhaseShift") {
      const finished = this.phaseShiftCast
        ? !boss.skillCast
        : (this.phaseShiftMs -= dtMs) <= 0;
      if (finished) {
        this.state = "Engaged";
        this.phaseShiftCast = false;
        boss.flags.phaseGlow = false;
        this.playRole("idle", { restart: true });
      }
      return;
    }

    if (!player.alive) {
      this.state = "Engaged";
      boss.state = "Idle";
      this.playRole("idle");
      return;
    }

    const distance = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (this.state === "Dormant") {
      boss.state = "Dormant";
      this.playRole("idle");
      if (distance <= this.config.aggroRange) this.state = "Engaged";
      else return;
    }

    if (boss.skillCast) {
      this.state = "Skill";
      return;
    }

    if (boss.pendingChain) {
      const chain = boss.pendingChain;
      boss.pendingChain = null;
      if (this.skillRuntime.start(boss, chain, player, world, { ignoreCooldown: true })) {
        this.state = "Skill";
        return;
      }
    }

    this.thinkCooldownMs = Math.max(0, this.thinkCooldownMs - dtMs);
    const available = this.availableSkills(player);
    const inRange = available.filter(item => item.inRange);
    if (inRange.length && this.thinkCooldownMs <= 0) {
      const choice = weightedChoice(inRange, world.random);
      if (choice && this.skillRuntime.start(boss, choice.skillId, player, world)) {
        this.state = "Skill";
        this.thinkCooldownMs = 180;
        return;
      }
    }

    this.reposition(available, dtMs, world);
  }

  updatePhase(world) {
    const hpPct = this.actor.maxHp > 0 ? (this.actor.hp / this.actor.maxHp) * 100 : 0;
    const next = this.config.phases.find(phase => phaseMatches(phase, hpPct)) || this.phase;
    if (!next || next.phase === this.phase?.phase) return;
    this.phase = next;
    this.actor.phase = next.phase;
    this.state = "PhaseShift";
    this.actor.state = "PhaseShift";
    this.actor.skillCast = null;
    this.actor.pendingChain = null;
    const transitionSkill = this.transitionSkillFor(next);
    this.phaseShiftCast = Boolean(
      transitionSkill &&
      this.skillRuntime.start(this.actor, transitionSkill.id, world.player, world, {
        ignoreCooldown: true
      })
    );
    if (this.phaseShiftCast) {
      this.actor.state = "PhaseShift";
      this.phaseShiftMs = transitionSkill.durationMs;
    } else {
      // 回退：无可用转换序列时保持原 2 秒 phaseGlow 表现
      this.actor.flags.phaseGlow = true;
      this.phaseShiftMs = 2000;
      const transitionAnimation = next.transitionAnimationId;
      if (!transitionAnimation || !this.actor.animator.play(transitionAnimation, { restart: true })) {
        this.playRole("idle", { restart: true });
      }
    }
    world.emit("phaseShift", {
      actorId: this.actor.id,
      phase: next.phase,
      durationMs: this.phaseShiftMs
    });
  }

  transitionSkillFor(phase) {
    if (!phase.transitionAnimationId) return null;
    const entry = Object.values(this.skillRuntime.config.skills).find(
      skill =>
        skill.handler === "sequence" &&
        skill.animationId === phase.transitionAnimationId &&
        this.skillRuntime.supports(skill.id)
    );
    if (!entry) return null;
    const animation = this.skillRuntime.config.animations[entry.animationId];
    if (!animation?.frames?.length) return null;
    return { id: entry.id, durationMs: animation.totalDurationMs || 2000 };
  }

  availableSkills(target) {
    return (this.phase?.skills || [])
      .filter(entry => this.skillRuntime.supports(entry.skillId))
      .map(entry => {
        const skill = this.skillRuntime.config.skills[entry.skillId];
        const cooldown = this.actor.cooldowns[entry.skillId] || 0;
        const aim = skillAimGeometry(this.actor, target, skill.params, this.actor.facing);
        return {
          skillId: entry.skillId,
          skill,
          weight: Number(entry.weight ?? skill.weight) || 0,
          cooldown,
          aim,
          distance: aim.distance,
          inRange:
            cooldown <= 0 &&
            aim.distance >= skill.castRange.min &&
            aim.distance <= skill.castRange.max
        };
      });
  }

  reposition(available, dtMs, world) {
    const boss = this.actor;
    const ready = available.filter(item => item.cooldown <= 0);
    const targetSkill = ready.sort((a, b) => {
      const aDelta = a.distance < a.skill.castRange.min
        ? a.skill.castRange.min - a.distance
        : Math.max(0, a.distance - a.skill.castRange.max);
      const bDelta = b.distance < b.skill.castRange.min
        ? b.skill.castRange.min - b.distance
        : Math.max(0, b.distance - b.skill.castRange.max);
      return aDelta - bDelta;
    })[0];

    if (!targetSkill) {
      this.state = "Engaged";
      boss.state = "Engaged";
      this.playRole("idle");
      return;
    }

    const tooClose = targetSkill.distance < targetSkill.skill.castRange.min;
    const tooFar = targetSkill.distance > targetSkill.skill.castRange.max;
    if (!tooClose && !tooFar) {
      this.state = "Engaged";
      boss.state = "Engaged";
      this.playRole("idle");
      return;
    }

    const toward = targetSkill.aim.direction;
    const direction = tooClose ? { x: -toward.x, y: -toward.y } : toward;
    const speed = boss.moveSpeed * world.effectSystem.moveSpeedMultiplier(boss);
    const step = speed * dtMs / 1000;
    world.moveActor(boss, direction.x * step, direction.y * step);
    boss.facing = {
      x: direction.x,
      y: direction.y,
      label: Math.abs(direction.x) > Math.abs(direction.y)
        ? direction.x < 0 ? "L" : "R"
        : direction.y < 0 ? "U" : "D"
    };
    this.state = "Reposition";
    boss.state = "Moving";
    this.playRole("move");
  }
}
