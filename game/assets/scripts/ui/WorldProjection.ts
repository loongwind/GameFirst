interface Point { x: number; y: number; previousX?: number; previousY?: number }

/** One top-left logical coordinate system for every world layer. Camera never mutates combat. */
export class WorldProjection {
  /** Horizontal center clamp, ±(world 540 − canvas half 187.5) = ±352.5 (LOO-70 §2). Keeps the
   *  world edge on screen exactly when the player reaches it instead of panning past it. */
  static readonly CAMERA_LIMIT_X = 352.5;
  x = 0;
  y = 0;
  height = 667;
  alpha = 1;
  private initialized = false;

  follow(x: number, y: number, height: number): void {
    this.height = height;
    if (!this.initialized) { this.x = x; this.y = y; this.initialized = true; }
    // Continuous at the edge: small movement belongs to the diver, sustained movement to both.
    this.x = Math.max(x - 48, Math.min(x + 48, this.x));
    this.y = Math.max(y - 64, Math.min(y + 64, this.y));
    const limit = WorldProjection.CAMERA_LIMIT_X;
    this.x = Math.max(-limit, Math.min(limit, this.x));
  }
  point(x: number, y: number): { x: number; y: number } {
    return { x: 187.5 + x - this.x, y: this.height * .46 + y - this.y };
  }
  sample(item: Point): { x: number; y: number } {
    return this.point((item.previousX ?? item.x) + (item.x - (item.previousX ?? item.x)) * this.alpha,
      (item.previousY ?? item.y) + (item.y - (item.previousY ?? item.y)) * this.alpha);
  }
}
