import { normalize } from "./vector.js";

export class EffectSystem {
  apply(target, effect, source) {
    if (!target.alive) return;
    if (effect.effectType === "knockback") {
      const direction = normalize(target.x - source.x, target.y - source.y);
      const force = Number(effect.force) || 0;
      target.velocity.x += direction.x * force;
      target.velocity.y += direction.y * force;
      return;
    }

    if (effect.effectType === "slow") {
      const existing = target.debuffs.find(item => item.type === "slow");
      const durationMs = Number(effect.durationMs) || 0;
      const amount = Number(effect.amount) || 0;
      if (existing) {
        existing.remainingMs = Math.max(existing.remainingMs, durationMs);
        existing.amount = Math.max(existing.amount, amount);
      } else {
        target.debuffs.push({ type: "slow", amount, remainingMs: durationMs });
      }
    }
  }

  update(actor, dtMs) {
    for (const debuff of actor.debuffs) debuff.remainingMs -= dtMs;
    actor.debuffs = actor.debuffs.filter(debuff => debuff.remainingMs > 0);
  }

  moveSpeedMultiplier(actor) {
    return actor.debuffs
      .filter(debuff => debuff.type === "slow")
      .reduce((multiplier, debuff) => multiplier * Math.max(0, 1 - debuff.amount), 1);
  }
}
