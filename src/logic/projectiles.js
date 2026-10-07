import { normalize } from "./vector.js";
import { rectangleHitsActor } from "./shapes.js";

export class ProjectileSystem {
  constructor(configs) {
    this.configs = configs;
    this.items = [];
    this.nextId = 1;
  }

  spawn(projectileId, caster, targetLocation, skill, effectDefinitions) {
    const config = this.configs[projectileId];
    if (!config) throw new Error(`Unknown projectile: ${projectileId}`);
    const direction = normalize(targetLocation.x - caster.x, targetLocation.y - caster.y);
    const forward = Number(config.spawnForwardOffset) || 0;
    const side = Number(config.spawnSideOffset) || 0;
    const perpendicular = { x: -direction.y, y: direction.x };
    this.items.push({
      id: `projectile-${this.nextId++}`,
      projectileId,
      ownerId: caster.id,
      x: caster.x + direction.x * forward + perpendicular.x * side,
      y: caster.y + direction.y * forward + perpendicular.y * side - 80,
      direction,
      rotation: Math.atan2(direction.y, direction.x),
      speed: Number(config.speed) || 0,
      width: Number(config.colliderWidth) || Number(config.displayWidth) || 1,
      height: Number(config.colliderHeight) || Number(config.displayHeight) || 1,
      displayWidth: Number(config.displayWidth) || 1,
      displayHeight: Number(config.displayHeight) || 1,
      distance: 0,
      maxDistance: Number(config.maxDistance) || Math.max(1600, (Number(config.speed) || 1) * 3),
      remainingMs: Number(config.lifetimeMs) || 5000,
      damage: Number(skill.damage) || 0,
      effects: effectDefinitions,
      destroyOnHit: config.destroyOnHit !== false,
      destroyOnWorld: config.destroyOnWorld !== false,
      dead: false
    });
  }

  update(dt, world) {
    const bounds = world.world.playBounds;
    for (const projectile of this.items) {
      const step = projectile.speed * dt;
      projectile.x += projectile.direction.x * step;
      projectile.y += projectile.direction.y * step;
      projectile.distance += step;
      projectile.remainingMs -= dt * 1000;

      const target = world.player;
      if (
        target.alive &&
        target.id !== projectile.ownerId &&
        rectangleHitsActor(
          {
            x: projectile.x,
            y: projectile.y,
            width: projectile.width,
            height: projectile.height,
            rotation: projectile.rotation
          },
          target
        )
      ) {
        world.damageActor(target, projectile.damage, world.actorById(projectile.ownerId), projectile.effects);
        world.emit("projectileHit", {
          projectileId: projectile.projectileId,
          x: projectile.x,
          y: projectile.y
        });
        if (projectile.destroyOnHit) projectile.dead = true;
      }

      const outside =
        projectile.x < bounds.x ||
        projectile.x > bounds.x + bounds.width ||
        projectile.y < bounds.y ||
        projectile.y > bounds.y + bounds.height;
      if (
        projectile.remainingMs <= 0 ||
        projectile.distance >= projectile.maxDistance ||
        (outside && projectile.destroyOnWorld)
      ) {
        projectile.dead = true;
      }
    }
    this.items = this.items.filter(projectile => !projectile.dead);
  }
}
