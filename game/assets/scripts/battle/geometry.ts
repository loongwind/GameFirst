export interface CircleBody { id: number; x: number; y: number; radius: number; previousX?: number; previousY?: number }

export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  return (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2;
}

export function segmentHitsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / length2));
  return (ax + t * dx - cx) ** 2 + (ay + t * dy - cy) ** 2 <= radius * radius;
}

/** Circle center moves a→b while a wave radius grows inner→outer this tick. */
export function expandingRingHitsCircle(ax: number, ay: number, bx: number, by: number, bodyRadius: number, inner: number, outer: number): boolean {
  // f(t)=|a+t(b-a)|-(inner+t(outer-inner)) is convex. Its maximum is
  // at an endpoint. If both endpoints are behind the ring, no hit is possible.
  if (Math.max(Math.hypot(ax, ay) - inner, Math.hypot(bx, by) - outer) < -bodyRadius) return false;
  // Test whether distance ever reaches the outer edge. Squaring gives a
  // quadratic; its minimum lies at an endpoint or its convex vertex.
  const dx = bx - ax, dy = by - ay, growth = outer - inner, radius = inner + bodyRadius;
  const a = dx * dx + dy * dy - growth * growth;
  const b = 2 * (ax * dx + ay * dy - radius * growth);
  const c = ax * ax + ay * ay - radius * radius;
  let minimum = Math.min(c, a + b + c);
  if (a > 0) {
    const t = Math.max(0, Math.min(1, -b / (2 * a)));
    minimum = Math.min(minimum, a * t * t + b * t + c);
  }
  return minimum <= 1e-9;
}

/** Bounds include body radii, so even large circles straddling a cell are found. */
export class SpatialGrid<T extends CircleBody> {
  private readonly cells = new Map<string, T[]>();
  constructor(readonly cellSize = 64) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Invalid grid size');
  }

  rebuild(bodies: Iterable<T>, swept = false): void {
    // Only the current occupied cells survive; movement cannot grow a permanent trail.
    this.cells.clear();
    for (const body of bodies) {
      const px = swept ? body.previousX ?? body.x : body.x, py = swept ? body.previousY ?? body.y : body.y;
      const left = Math.floor((Math.min(body.x, px) - body.radius) / this.cellSize);
      const right = Math.floor((Math.max(body.x, px) + body.radius) / this.cellSize);
      const top = Math.floor((Math.min(body.y, py) - body.radius) / this.cellSize);
      const bottom = Math.floor((Math.max(body.y, py) + body.radius) / this.cellSize);
      for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
        const key = `${x},${y}`;
        const cell = this.cells.get(key);
        if (cell) cell.push(body); else this.cells.set(key, [body]);
      }
    }
  }

  query(left: number, top: number, right: number, bottom: number): T[] {
    const found: T[] = [], seen = new Set<number>();
    for (let x = Math.floor(left / this.cellSize); x <= Math.floor(right / this.cellSize); x++) {
      for (let y = Math.floor(top / this.cellSize); y <= Math.floor(bottom / this.cellSize); y++) {
        const cell = this.cells.get(`${x},${y}`);
        if (cell) for (const body of cell) if (!seen.has(body.id)) { seen.add(body.id); found.push(body); }
      }
    }
    return found;
  }
}
