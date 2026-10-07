export class Animator {
  constructor(animations, initialAnimationId = null) {
    this.animations = animations;
    this.animationId = null;
    this.frameIndex = 0;
    this.elapsedMs = 0;
    this.playing = false;
    this.completed = false;
    this.speed = 1;
    this.pendingEvents = [];
    if (initialAnimationId) this.play(initialAnimationId, { restart: true });
  }

  get animation() {
    return this.animations[this.animationId] || null;
  }

  get frame() {
    return this.animation?.frames?.[this.frameIndex] || null;
  }

  play(animationId, { restart = false, speed = 1 } = {}) {
    const animation = this.animations[animationId];
    if (!animation || !animation.frames?.length) return false;
    if (this.animationId === animationId && this.playing && !restart) {
      this.speed = speed;
      return false;
    }
    this.animationId = animationId;
    this.frameIndex = 0;
    this.elapsedMs = 0;
    this.playing = true;
    this.completed = false;
    this.speed = speed;
    this.pendingEvents = [];
    this.pendingEvents.push({
      type: "animationFrame",
      animationId,
      frame: animation.frames[0].index
    });
    return true;
  }

  stop() {
    this.playing = false;
  }

  update(dtMs) {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    const animation = this.animation;
    if (!animation || !this.playing || !animation.frames.length) return events;

    this.elapsedMs += Math.max(0, dtMs) * this.speed;
    let guard = animation.frames.length * 4 + 8;
    while (this.playing && guard-- > 0) {
      const frame = animation.frames[this.frameIndex];
      const duration = Math.max(1, Number(frame.durationMs) || 1);
      if (this.elapsedMs < duration) break;
      this.elapsedMs -= duration;

      const loopStart = Number.isInteger(animation.loopStartFrame)
        ? animation.loopStartFrame
        : 0;
      const loopEnd = Number.isInteger(animation.loopEndFrame)
        ? animation.loopEndFrame
        : animation.frames.length - 1;

      if (this.frameIndex >= animation.frames.length - 1 || this.frameIndex >= loopEnd) {
        if (animation.loop) {
          this.frameIndex = Math.max(0, Math.min(loopStart, animation.frames.length - 1));
        } else {
          this.frameIndex = animation.frames.length - 1;
          this.playing = false;
          this.completed = true;
          events.push({ type: "animationComplete", animationId: this.animationId });
          break;
        }
      } else {
        this.frameIndex++;
      }

      events.push({
        type: "animationFrame",
        animationId: this.animationId,
        frame: animation.frames[this.frameIndex].index
      });
    }
    return events;
  }
}
