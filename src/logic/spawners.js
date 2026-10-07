import { circleHitsActor } from "./shapes.js";

export class SpawnerSystem {
  constructor() {
    this.spawners = [];
    this.hazards = [];
    this.nextId = 1;
  }

  start(caster, skill, effects) {
    const params = skill.params;
    this.spawners.push({
      id: `spawner-${this.nextId++}`,
      casterId: caster.id,
      skillId: skill.id,
      damage: Number(skill.damage) || 0,
      effects,
      wavesLeft: Number(params.waves) || 1,
      nextWaveMs: 0,
      intervalMs: Number(params.waveIntervalMs) || 1000,
      warningMs: Number(params.waveIntervalMs) || 1000,
      radius: Number(params.radius) || 200,
      elapsedMs: 0,
      durationMs: Number(params.durationMs) || 1000,
      complete: false
    });
  }

  update(dtMs, world) {
    for (const spawner of this.spawners) {
      spawner.elapsedMs += dtMs;
      spawner.nextWaveMs -= dtMs;
      if (spawner.wavesLeft > 0 && spawner.nextWaveMs <= 0) {
        spawner.wavesLeft--;
        spawner.nextWaveMs += spawner.intervalMs;
        const target = world.player;
        this.hazards.push({
          id: `hazard-${this.nextId++}`,
          casterId: spawner.casterId,
          skillId: spawner.skillId,
          x: target.x,
          y: target.y,
          radius: spawner.radius,
          warningMs: spawner.warningMs,
          initialWarningMs: spawner.warningMs,
          damage: spawner.damage,
          effects: spawner.effects,
          resolved: false,
          justSpawned: true,
          lifeAfterMs: 280
        });
        world.emit("skillWave", {
          skillId: spawner.skillId,
          x: target.x,
          y: target.y
        });
      }
      if (spawner.wavesLeft <= 0 && spawner.elapsedMs >= spawner.durationMs) {
        spawner.complete = true;
      }
    }
    this.spawners = this.spawners.filter(spawner => !spawner.complete);

    for (const hazard of this.hazards) {
      if (hazard.justSpawned) {
        hazard.justSpawned = false;
        continue;
      }
      if (!hazard.resolved) {
        hazard.warningMs -= dtMs;
        if (hazard.warningMs <= 0) {
          hazard.resolved = true;
          if (circleHitsActor(hazard, world.player)) {
            world.damageActor(
              world.player,
              hazard.damage,
              world.actorById(hazard.casterId),
              hazard.effects
            );
          }
          world.emit("hazardResolve", {
            skillId: hazard.skillId,
            x: hazard.x,
            y: hazard.y,
            radius: hazard.radius
          });
        }
      } else {
        hazard.lifeAfterMs -= dtMs;
      }
    }
    this.hazards = this.hazards.filter(hazard => !hazard.resolved || hazard.lifeAfterMs > 0);
  }

  hasSpawner(casterId, skillId) {
    return this.spawners.some(item => item.casterId === casterId && item.skillId === skillId);
  }
}
