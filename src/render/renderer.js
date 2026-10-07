import { combatFeelConfig } from "../config/combatFeel.js";
import { playerConfig } from "../config/character.js";
import { skillOriginPoint } from "../logic/skills/skillGeometry.js";
import { Camera } from "./camera.js";
import { sortByY } from "./ysort.js";

function blendMode(mode) {
  if (mode === "add") return "lighter";
  if (mode === "multiply") return "multiply";
  return "source-over";
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

const TINT_COLORS = {
  golden: "255,198,64",
  red: "255,74,57",
  white: "255,255,255"
};

function tintColor(name, alpha) {
  const rgb = TINT_COLORS[name] || TINT_COLORS.white;
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0.5));
  return `rgba(${rgb},${safeAlpha})`;
}

export function bossMeleeVfxTransform(boss, cast) {
  const sourceDirection = cast?.direction || boss.facing || { x: 1, y: 0 };
  const magnitude = Math.hypot(sourceDirection.x, sourceDirection.y) || 1;
  const direction = {
    x: sourceDirection.x / magnitude,
    y: sourceDirection.y / magnitude
  };
  const params = cast?.skill?.params || {};
  const origin = skillOriginPoint(boss, params, direction);
  const radius = Math.max(0, Number(params.radius) || 0);
  const halfAngle = radians(Math.max(0, Number(params.angleDeg) || 0) * 0.5);

  return {
    x: origin.x,
    y: origin.y,
    rotation: Math.atan2(direction.y, direction.x),
    width: radius,
    height: radius * 2 * Math.sin(Math.min(Math.PI * 0.5, halfAngle))
  };
}

function activeFrameSet(manifest) {
  return new Set(manifest.player.animations.attack.activeFrames);
}

export class Renderer {
  constructor(canvas, scene, images, manifest, bossConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scene = scene;
    this.images = images;
    this.manifest = manifest;
    this.bossConfig = bossConfig;
    this.camera = new Camera(scene.cameraBounds);
    this.dpr = 1;
    this.viewport = { width: 1, height: 1 };
    this.activeFrames = activeFrameSet(manifest);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(240, Math.floor(rect.height));

    const pixelWidth = Math.floor(width * dpr);
    const pixelHeight = Math.floor(height * dpr);
    const sizeChanged =
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight ||
      this.viewport.width !== width ||
      this.viewport.height !== height ||
      this.dpr !== dpr;

    if (sizeChanged) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.dpr = dpr;
      this.viewport = { width, height };
      this.camera.resize(width, height);
    }
  }

  screenToWorld(x, y) {
    return this.camera.screenToWorld(x, y);
  }

  render(game, vfx) {
    this.resize();
    this.camera.follow(game.player);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    ctx.fillStyle = "#2c2119";
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const shake = this.getShake(game);
    ctx.save();
    ctx.translate(-this.camera.x + shake.x, -this.camera.y + shake.y);
    this.drawGround();
    this.drawImageLayers("image_overlay");
    this.drawObjects(this.scene.decalObjects);
    this.drawMoveMarker(game);
    this.drawTelegraphs(game);
    this.drawHitbox(game);
    this.drawSlashTrails(vfx);
    this.drawRollGhosts(vfx, game);
    this.drawSortedWorld(game);
    this.drawCurrentSlash(game);
    this.drawProjectiles(game);
    this.drawBossSkillVfx(game);
    this.drawSkillBursts(vfx);
    this.drawActorShapeDebug(game);
    this.drawParticles(vfx);
    this.drawImageLayers("lighting");
    ctx.restore();
  }

  getShake(game) {
    if (game.feedback.shakeT <= 0) return { x: 0, y: 0 };
    const strength = combatFeelConfig.shake.power * (game.feedback.shakeT / game.feedback.shakeDuration);
    return {
      x: (Math.random() * 2 - 1) * strength,
      y: (Math.random() * 2 - 1) * strength * combatFeelConfig.shake.yScale
    };
  }

  drawGround() {
    for (const layer of this.scene.groundLayers) {
      const tileset = this.scene.tilesets.find(item => item.properties.role === "ground") || this.scene.tilesets[0];
      const image = this.images.scene.get(tileset.imagePath);
      if (!image) continue;

      for (let y = 0; y < layer.height; y++) {
        for (let x = 0; x < layer.width; x++) {
          const raw = layer.data[y * layer.width + x];
          if (!raw) continue;
          const localId = raw - tileset.firstgid;
          const sx = (localId % tileset.columns) * tileset.tileWidth;
          const sy = Math.floor(localId / tileset.columns) * tileset.tileHeight;
          this.ctx.drawImage(
            image,
            sx,
            sy,
            tileset.tileWidth,
            tileset.tileHeight,
            x * this.scene.tileWidth,
            y * this.scene.tileHeight,
            this.scene.tileWidth,
            this.scene.tileHeight
          );
        }
      }
    }
  }

  drawImageLayers(role) {
    for (const layer of this.scene.imageLayers) {
      if (layer.properties.role !== role) continue;
      const image = this.images.scene.get(layer.imagePath);
      if (!image) continue;
      this.ctx.save();
      this.ctx.globalAlpha = layer.opacity;
      this.ctx.globalCompositeOperation = blendMode(layer.blendMode);
      this.ctx.drawImage(image, layer.offsetX, layer.offsetY, layer.width, layer.height);
      this.ctx.restore();
    }
  }

  drawObjects(objects) {
    for (const object of objects) this.drawTiledObject(object);
  }

  drawTiledObject(object) {
    const image = this.images.scene.get(object.imagePath);
    if (!image) return;
    const width = object.width || object.tile?.width || image.width;
    const height = object.height || object.tile?.height || image.height;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.rotate(radians(object.rotation || 0));
    if (object.flipH) {
      ctx.scale(-1, 1);
      ctx.drawImage(image, -width, -height, width, height);
    } else {
      ctx.drawImage(image, 0, -height, width, height);
    }
    ctx.restore();
  }

  drawMoveMarker(game) {
    const target = game.player.moveTarget;
    if (!target) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f2bf61";
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(target.x - 14, target.y);
    ctx.lineTo(target.x - 5, target.y);
    ctx.moveTo(target.x + 5, target.y);
    ctx.lineTo(target.x + 14, target.y);
    ctx.moveTo(target.x, target.y - 14);
    ctx.lineTo(target.x, target.y - 5);
    ctx.moveTo(target.x, target.y + 5);
    ctx.lineTo(target.x, target.y + 14);
    ctx.stroke();
    ctx.restore();
  }

  drawTelegraphs(game) {
    const ctx = this.ctx;
    const circles = [
      ...game.telegraphs.map(item => ({ ...item, progress: 0.35 })),
      ...game.spawnerSystem.hazards
        .filter(item => !item.resolved)
        .map(item => ({
          ...item,
          progress: 1 - item.warningMs / Math.max(1, item.initialWarningMs)
        }))
    ];
    for (const warning of circles) {
      ctx.save();
      ctx.fillStyle = "rgba(170, 24, 22, 0.20)";
      ctx.strokeStyle = "rgba(255, 74, 57, 0.86)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(warning.x, warning.y, warning.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const innerRadius = warning.radius * Math.max(0.08, 1 - (warning.progress || 0));
      ctx.strokeStyle = "rgba(255, 218, 157, 0.78)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(warning.x, warning.y, innerRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawProjectiles(game) {
    const ctx = this.ctx;
    for (const projectile of game.projectileSystem.items) {
      const image = this.images.projectiles[projectile.projectileId];
      if (!image) continue;
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(projectile.rotation);
      ctx.drawImage(
        image,
        -projectile.displayWidth * 0.5,
        -projectile.displayHeight * 0.5,
        projectile.displayWidth,
        projectile.displayHeight
      );
      ctx.restore();
    }
  }

  drawBossSkillVfx(game) {
    const vfx = this.images.vfx.boss_1_melee_slash;
    if (!vfx) return;
    for (const boss of game.bosses) {
      const cast = boss.skillCast;
      if (cast?.skill.id !== "melee") continue;
      const frameIndex = boss.animator.frame?.index;
      const image = vfx.frames[frameIndex];
      if (!image) continue;
      const transform = bossMeleeVfxTransform(boss, cast);
      if (transform.width <= 0 || transform.height <= 0) continue;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = frameIndex === 4 ? 0.92 : 0.72;
      ctx.translate(transform.x, transform.y);
      ctx.rotate(transform.rotation);
      ctx.drawImage(
        image,
        0,
        -transform.height * 0.5,
        transform.width,
        transform.height
      );
      ctx.restore();
    }
  }

  drawSkillBursts(vfx) {
    const ctx = this.ctx;
    for (const burst of vfx.skillBursts) {
      const source = this.images.vfx[burst.vfxId];
      const frameIds = Object.keys(source?.frames || {}).map(Number).sort((a, b) => a - b);
      if (!frameIds.length) continue;
      const progress = 1 - burst.life / burst.maxLife;
      const index = Math.min(frameIds.length - 1, Math.floor(progress * frameIds.length));
      const image = source.frames[frameIds[index]];
      const size = 220;
      ctx.save();
      ctx.globalAlpha = Math.min(1, burst.life / 0.12);
      ctx.drawImage(image, burst.x - size * 0.5, burst.y - size * 0.82, size, size);
      ctx.restore();
    }
  }

  drawActorShapeDebug(game) {
    if (!game.debug.showActorShapes && !game.debug.lastBossShape) return;
    const ctx = this.ctx;
    if (game.debug.showActorShapes) {
      for (const actor of game.actors.values()) {
        for (const [shape, color] of [
          [actor.body, "#53d7ff"],
          [actor.hurtbox, "#ff5a62"]
        ]) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.ellipse(
            actor.x + shape.offsetX,
            actor.y + shape.offsetY,
            shape.width * 0.5,
            shape.height * 0.5,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    const shape = game.debug.lastBossShape;
    if (!shape) return;
    ctx.save();
    ctx.strokeStyle = "#ffcf5a";
    ctx.fillStyle = "rgba(255, 94, 52, 0.16)";
    ctx.lineWidth = 3;
    if (shape.type === "circle") {
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (shape.type === "arc") {
      const angle = Math.atan2(shape.direction.y, shape.direction.x);
      ctx.beginPath();
      ctx.moveTo(shape.x, shape.y);
      ctx.arc(
        shape.x,
        shape.y,
        shape.radius,
        angle - shape.angleRad * 0.5,
        angle + shape.angleRad * 0.5
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHitbox(game) {
    const active =
      game.player.state === "Attacking" &&
      this.activeFrames.has(game.player.animator.frameIndex);
    if (!active || !game.debug.showHitbox) return;
    const capsule = game.getHitCapsuleForRender();
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = capsule.radius * 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#f6d166";
    ctx.beginPath();
    ctx.moveTo(capsule.start.x, capsule.start.y);
    ctx.lineTo(capsule.end.x, capsule.end.y);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff0a6";
    ctx.stroke();
    ctx.restore();
  }

  drawSortedWorld(game) {
    const items = [];
    for (const object of this.scene.propObjects) {
      items.push({
        type: "object",
        sortY: object.sortY ?? object.y,
        order: object.id,
        object
      });
    }
    for (const [index, boss] of game.bosses.entries()) {
      items.push({ type: "boss", sortY: boss.y, order: 100000 + index, boss, game });
    }
    items.push({ type: "player", sortY: game.player.y, order: 200001, game });

    for (const item of sortByY(items)) {
      if (item.type === "object") this.drawTiledObject(item.object);
      if (item.type === "boss") this.drawBoss(item.boss, item.game);
      if (item.type === "player") this.drawPlayer(item.game);
    }
  }

  drawShadow(x, y, radius, alpha = 0.28) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.32);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fill();
    ctx.restore();
  }

  drawBoss(boss) {
    const bossImages = this.images.bosses[boss.configId];
    const animation = bossImages?.animations[boss.animator.animationId];
    if (!animation) return;
    const frameIndex = boss.animator.frameIndex;
    let frame = animation.defaultFrames[frameIndex] || animation.defaultFrames[0];
    let mirror = animation.directionMode === "horizontal_mirror" && boss.facing.x < 0;

    if (Object.keys(animation.framesByDirection).length) {
      const direction = Math.abs(boss.facing.x) > Math.abs(boss.facing.y)
        ? boss.facing.x < 0 ? "L" : "R"
        : boss.facing.y < 0 ? "U" : "D";
      const directionConfig = animation.directions[direction] || { source: direction, mirror: false };
      const frames = animation.framesByDirection[directionConfig.source] || [];
      frame = frames[frameIndex] || frames[0];
      mirror = Boolean(directionConfig.mirror);
    }
    if (!frame) return;

    const display = boss.display;
    const frameScale = boss.animator.frame?.visualScale || 1;
    const phaseScale = (boss.flags.phaseScale || 1) * frameScale;
    this.drawShadow(boss.x, boss.y, boss.body.width * 0.42 * phaseScale, 0.32);
    this.drawTrimmedFrame(frame, {
      x: boss.x,
      y: boss.y,
      display,
      mirror,
      scale: (animation.displayScale || 1) * phaseScale,
      tint: boss.flashT > 0 ? "rgba(255,255,255,0.75)" :
        this.bossCastTint(boss) ||
        (boss.flags.phaseGlow ? "rgba(255,198,64,0.38)" : null)
    });
  }

  bossCastTint(boss) {
    const cast = boss.skillCast;
    if (!cast) return null;
    const frame = boss.animator.frame?.index;
    if (frame == null) return null;
    for (const eventId of cast.skill.eventIds) {
      const event = this.bossConfig.skillEvents[eventId];
      if (event?.eventType !== "vfx" || event.attachTo !== "boss") continue;
      if (event.trigger !== "frame_range") continue;
      if (frame < event.frameStart || frame > event.frameEnd) continue;
      const vfx = this.bossConfig.vfx[event.refId];
      if (vfx?.kind !== "procedural_tint") continue;
      return tintColor(vfx.color, vfx.alpha);
    }
    return null;
  }

  drawTrimmedFrame(frame, { x, y, display, mirror = false, scale = 1, alpha = 1, tint = null }) {
    const scaleX = (display.width / frame.sourceWidth) * scale;
    const scaleY = (display.height / frame.sourceHeight) * scale;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (mirror) ctx.scale(-1, 1);
    const dx = frame.trimX * scaleX - display.anchorX * scale;
    const dy = frame.trimY * scaleY - display.anchorY * scale;
    const dw = frame.sw * scaleX;
    const dh = frame.sh * scaleY;
    if (tint) {
      // 在离屏画布上以 source-atop 叠色，保证只有角色非透明像素被着色，
      // 而不是把主画布上整个矩形区域染色。
      const scratch = this.getTintScratch(frame.sw, frame.sh);
      scratch.clearRect(0, 0, frame.sw, frame.sh);
      scratch.globalCompositeOperation = "source-over";
      scratch.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
      scratch.globalCompositeOperation = "source-atop";
      scratch.fillStyle = tint;
      scratch.fillRect(0, 0, frame.sw, frame.sh);
      ctx.drawImage(scratch.canvas, 0, 0, frame.sw, frame.sh, dx, dy, dw, dh);
    } else {
      ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  getTintScratch(width, height) {
    if (!this.tintScratch) {
      this.tintScratch = document.createElement("canvas").getContext("2d");
    }
    const canvas = this.tintScratch.canvas;
    if (canvas.width < width) canvas.width = width;
    if (canvas.height < height) canvas.height = height;
    return this.tintScratch;
  }

  drawPlayer(game) {
    const player = game.player;
    const attacking = player.state === "Attacking";
    const action = attacking ? "attack" : "move";
    const direction = attacking ? player.attackDirection : player.direction;
    const config = game.directionConfigs[direction];
    const frames = this.images.player[action][config.source];
    const image = frames?.[player.animator.frameIndex] || frames?.[0];
    if (!image) return;

    const anchor = attacking ? config.attackAnchor : config.moveAnchor;
    const displayScale = attacking ? config.attackDisplayScale : 1;
    const scale = player.visualScale * displayScale;

    this.drawShadow(player.x, player.y, 43 * (player.visualScale / playerConfig.baseReferenceScale), 0.28);

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (config.mirror) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    ctx.translate(-anchor.x, -anchor.y);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  drawRollGhosts(vfx, game) {
    for (const ghost of vfx.rollGhosts) {
      const alpha = ghost.life / ghost.maxLife;
      this.drawPlayerSprite({
        x: ghost.x,
        y: ghost.y,
        frame: ghost.frame,
        direction: ghost.direction,
        visualScale: ghost.scale,
        action: "move",
        alpha: 0.35 * alpha,
        tint: false,
        game
      });
    }
  }

  drawPlayerSprite({ x, y, frame, direction, visualScale, action, alpha = 1, tint = false, game }) {
    const config = game.directionConfigs[direction];
    const frames = this.images.player[action][config.source];
    const image = frames?.[frame] || frames?.[0];
    if (!image) return;

    const anchor = action === "attack" ? config.attackAnchor : config.moveAnchor;
    const displayScale = action === "attack" ? config.attackDisplayScale : 1;
    const scale = visualScale * displayScale;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (config.mirror) ctx.scale(-1, 1);
    ctx.scale(scale, scale);
    ctx.translate(-anchor.x, -anchor.y);
    ctx.drawImage(image, 0, 0);
    if (tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(95,179,224,0.72)";
      ctx.fillRect(0, 0, image.width, image.height);
    }
    ctx.restore();
  }

  drawCurrentSlash(game) {
    const player = game.player;
    const frame = player.animator.frameIndex;
    if (player.state !== "Attacking" || frame < 3 || frame > 5) return;
    this.drawDirectionalSlash(
      frame,
      player.attackDirection,
      player.x,
      player.y,
      player.visualScale,
      1,
      game
    );
  }

  drawSlashTrails(vfx) {
    for (const slash of vfx.slashTrails) {
      this.drawDirectionalSlash(
        slash.frame,
        slash.direction,
        slash.x,
        slash.y,
        slash.scale,
        (slash.life / slash.maxLife) * 0.45
      );
    }
  }

  drawDirectionalSlash(frame, direction, x, y, playerScale, alphaMultiplier, game = null) {
    const directionConfigs = game?.directionConfigs || this.manifest.player.directionConfigs;
    const config = directionConfigs[direction];
    const slashConfig = config?.slashFrames?.[String(frame)];
    const image = this.images.slash[frame];
    if (!slashConfig || !image) return;

    const scaleRatio = playerScale / playerConfig.baseReferenceScale;
    const slashScale =
      playerScale *
      config.attackDisplayScale *
      this.manifest.effects.attackSlash.scale;
    const mirrorSign = config.mirror ? -1 : 1;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = slashConfig.alpha * alphaMultiplier;
    ctx.translate(x, y);
    ctx.translate(
      slashConfig.offset[0] * scaleRatio * mirrorSign,
      slashConfig.offset[1] * scaleRatio
    );
    ctx.rotate(slashConfig.rotation * mirrorSign);
    const sourceFlipX = config.mirror ? !slashConfig.localFlipX : slashConfig.localFlipX;
    ctx.scale(sourceFlipX ? -1 : 1, 1);
    ctx.scale(slashScale, slashScale);
    ctx.translate(-slashConfig.pivot[0], -slashConfig.pivot[1]);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  drawParticles(vfx) {
    const ctx = this.ctx;
    for (const particle of vfx.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      if (particle.line) {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = Math.max(1, particle.size * 0.65);
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 0.024, particle.y - particle.vy * 0.024);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const impact of vfx.impacts) {
      const alpha = impact.life / impact.maxLife;
      ctx.save();
      ctx.translate(impact.x, impact.y);
      ctx.rotate(impact.angle);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#fff1b8";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const angle = (i - 2) * 0.42;
        const len = 36 * impact.scaleRatio * alpha;
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(8 * impact.scaleRatio, 0);
        ctx.lineTo(8 * impact.scaleRatio + len, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  }
}
