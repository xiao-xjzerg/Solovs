function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export class VfxSystem {
  constructor() {
    this.particles = [];
    this.slashTrails = [];
    this.rollGhosts = [];
    this.impacts = [];
    this.notices = [];
    this.skillBursts = [];
  }

  handleEvent(event) {
    if (event.type === "hit") this.spawnImpact(event);
    if (event.type === "slashTrail") this.spawnSlashTrail(event);
    if (event.type === "rollGhost") this.spawnRollGhost(event);
    if (event.type === "notice") this.notices.push({ message: event.message, life: 0.8 });
    if (event.type === "hazardResolve") {
      this.skillBursts.push({
        vfxId: "crystal_shard",
        x: event.x,
        y: event.y,
        life: 0.5,
        maxLife: 0.5
      });
    }
  }

  spawnSlashTrail(event) {
    this.slashTrails.push({
      frame: event.frame,
      direction: event.direction,
      x: event.x,
      y: event.y,
      scale: event.scale,
      life: event.life,
      maxLife: event.life
    });
  }

  spawnRollGhost(event) {
    this.rollGhosts.push({
      x: event.x,
      y: event.y,
      direction: event.direction,
      frame: event.frame,
      scale: event.scale,
      life: event.life,
      maxLife: event.life
    });
  }

  spawnImpact(event) {
    const palette = ["#fffdf2", "#ffe8aa", "#f5bd55", "#df7f31"];
    const angleBase = Math.atan2(event.direction.y, event.direction.x);
    for (let i = 0; i < 12; i++) {
      const angle = angleBase + randomBetween(-0.9, 0.9);
      const speed = randomBetween(90, 310) * event.scaleRatio;
      const life = randomBetween(0.13, 0.31);
      this.particles.push({
        x: event.x,
        y: event.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomBetween(1.5, 5.3) * event.scaleRatio,
        color: palette[Math.floor(Math.random() * palette.length)],
        line: i < 5
      });
    }
    this.impacts.push({
      x: event.x,
      y: event.y,
      angle: angleBase,
      life: 0.13,
      maxLife: 0.13,
      scaleRatio: event.scaleRatio
    });
  }

  update(realDt, motionScale = 1) {
    const motionDt = realDt * motionScale;

    for (const particle of this.particles) {
      particle.life -= realDt;
      particle.x += particle.vx * motionDt;
      particle.y += particle.vy * motionDt;
      particle.vy += 360 * motionDt;
      const damping = Math.pow(0.05, motionDt);
      particle.vx *= damping;
      particle.vy *= damping;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);

    for (const slash of this.slashTrails) slash.life -= realDt;
    this.slashTrails = this.slashTrails.filter(slash => slash.life > 0);

    for (const ghost of this.rollGhosts) ghost.life -= realDt;
    this.rollGhosts = this.rollGhosts.filter(ghost => ghost.life > 0);

    for (const impact of this.impacts) impact.life -= realDt;
    this.impacts = this.impacts.filter(impact => impact.life > 0);

    for (const notice of this.notices) notice.life -= realDt;
    this.notices = this.notices.filter(notice => notice.life > 0);

    for (const burst of this.skillBursts) burst.life -= realDt;
    this.skillBursts = this.skillBursts.filter(burst => burst.life > 0);
  }
}
