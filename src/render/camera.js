import { clamp } from "../logic/vector.js";

export class Camera {
  constructor(bounds) {
    this.bounds = bounds;
    this.x = bounds.x;
    this.y = bounds.y;
    this.width = 1;
    this.height = 1;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  follow(target) {
    const maxX = this.bounds.x + Math.max(0, this.bounds.width - this.width);
    const maxY = this.bounds.y + Math.max(0, this.bounds.height - this.height);
    this.x = clamp(target.x - this.width * 0.5, this.bounds.x, maxX);
    this.y = clamp(target.y - this.height * 0.56, this.bounds.y, maxY);
  }

  screenToWorld(x, y) {
    return { x: this.x + x, y: this.y + y };
  }
}
