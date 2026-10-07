import { arcHitsActor, circleHitsActor } from "../shapes.js";
import { normalize } from "../vector.js";
import { skillOriginPoint } from "./skillGeometry.js";

export function createSkillHandlers() {
  return new Map([
    ["arc", {
      onFrame(cast, frame, world) {
        if (cast.hitApplied || frame !== cast.skill.hitFrame) return;
        cast.hitApplied = true;
        const params = cast.skill.params;
        const direction = cast.direction;
        const origin = skillOriginPoint(cast.caster, params, direction);
        const arc = {
          x: origin.x,
          y: origin.y,
          direction,
          radius: Number(params.radius) || 0,
          angleRad: ((Number(params.angleDeg) || 360) * Math.PI) / 180
        };
        if (arcHitsActor(arc, world.player)) {
          world.damageActor(world.player, cast.skill.damage, cast.caster, cast.effects);
        }
        world.debug.lastBossShape = { type: "arc", ...arc, life: 0.2 };
      }
    }],
    ["circle", {
      start(cast, world) {
        const radius = Number(cast.skill.params.radius) || 0;
        world.telegraphs.push({
          id: `telegraph-${cast.id}`,
          ownerId: cast.caster.id,
          kind: "circle",
          x: cast.caster.x,
          y: cast.caster.y,
          radius,
          skillId: cast.skill.id,
          active: true
        });
      },
      onFrame(cast, frame, world) {
        if (cast.hitApplied || frame !== cast.skill.hitFrame) return;
        cast.hitApplied = true;
        const circle = {
          x: cast.caster.x,
          y: cast.caster.y,
          radius: Number(cast.skill.params.radius) || 0
        };
        if (circleHitsActor(circle, world.player)) {
          world.damageActor(world.player, cast.skill.damage, cast.caster, cast.effects);
        }
        world.telegraphs = world.telegraphs.filter(item => item.id !== `telegraph-${cast.id}`);
        world.debug.lastBossShape = { type: "circle", ...circle, life: 0.25 };
      },
      finish(cast, world) {
        world.telegraphs = world.telegraphs.filter(item => item.id !== `telegraph-${cast.id}`);
      }
    }],
    ["projectile", {
      start() {},
      onFrame() {}
    }],
    ["sequence", {
      // 纯动画/事件序列：无判定与位移，帧事件由 SkillRuntime 分发，
      // 动画 animationComplete 即结束施法。
    }],
    ["spawner", {
      start(cast, world) {
        world.spawnerSystem.start(cast.caster, cast.skill, cast.effects);
        cast.durationMs = Number(cast.skill.params.durationMs) || 1000;
      },
      update(cast) {
        if (cast.elapsedMs >= cast.durationMs) cast.requestFinish = true;
      }
    }],
    ["charge", {
      start(cast) {
        cast.chargeActive = false;
        cast.chargeTarget = { ...cast.targetLocation };
        cast.chargeElapsedMs = 0;
      },
      onFrame(cast, frame) {
        if (frame === cast.skill.hitFrame) cast.chargeActive = true;
      },
      update(cast, dtMs, world) {
        if (!cast.chargeActive) return;
        cast.chargeElapsedMs += dtMs;
        const dx = cast.chargeTarget.x - cast.caster.x;
        const dy = cast.chargeTarget.y - cast.caster.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 12) {
          cast.requestFinish = true;
          return;
        }
        const direction = normalize(dx, dy);
        cast.direction = direction;
        const step = Math.min(distance, (Number(cast.skill.params.speed) || 400) * dtMs / 1000);
        const before = { x: cast.caster.x, y: cast.caster.y };
        world.moveActor(cast.caster, direction.x * step, direction.y * step);
        const moved = Math.hypot(cast.caster.x - before.x, cast.caster.y - before.y);
        if (!cast.hitApplied && circleHitsActor({
          x: cast.caster.x,
          y: cast.caster.y,
          radius: Math.max(cast.caster.body.width, cast.caster.body.height) * 0.5
        }, world.player)) {
          cast.hitApplied = true;
          world.damageActor(world.player, cast.skill.damage, cast.caster, cast.effects);
          cast.requestFinish = true;
        }
        if (moved < Math.min(0.5, step * 0.1) || cast.chargeElapsedMs >= 5000) {
          cast.requestFinish = true;
        }
      }
    }]
  ]);
}
