import { segmentHitsCircle } from './geometry';
import type { Enemy, Loot, Player, TerrainCircle } from './model';
import type { Vector } from './input';

/** Bounded local steering, deliberately no world pathfinding or platform clock. */
export class SonarSteering {
  private last: Vector = { x: 0, y: 1 };
  direction(player: Player, enemies: Iterable<Enemy>, loot: Iterable<Loot>, obstacles: readonly TerrainCircle[], danger: readonly TerrainCircle[], lowOxygen: boolean, canCollect: boolean): Vector {
    let target: { x: number; y: number } | undefined, distance = Infinity;
    let retreat: Vector | undefined;
    for (const zone of danger) {
      const dx = player.x - zone.x, dy = player.y - zone.y, d = Math.hypot(dx, dy);
      if (d < zone.radius + player.radius + 36) retreat = { x: dx / (d || 1) || (d === 0 ? 1 : 0), y: dy / (d || 1) };
    }
    for (const enemy of enemies) {
      const dx = enemy.x - player.x, dy = enemy.y - player.y, d = Math.hypot(dx, dy);
      if (d < enemy.radius + player.radius + 32) retreat ??= { x: -dx / (d || 1) || (d === 0 ? -1 : 0), y: -dy / (d || 1) };
      if (d < distance) { target = enemy; distance = d; }
    }
    if (canCollect && !retreat && !lowOxygen) {
      let nearest = Infinity;
      for (const item of loot) {
        const d = Math.hypot(item.x - player.x, item.y - player.y);
        if (item.value > 0 && d < nearest && d < 360) { target = item; nearest = d; }
      }
    }
    const desired = retreat ?? (lowOxygen ? { x: 0, y: player.y > 0 ? -1 : 0 } : target ? { x: target.x - player.x, y: target.y - player.y } : { x: 0, y: 1 });
    const length = Math.hypot(desired.x, desired.y);
    if (!length) return { x: 0, y: 0 };
    const angle = Math.atan2(desired.y, desired.x), step = player.speed / 30;
    let best: Vector = { x: 0, y: 0 }, score = -Infinity;
    // Direction order breaks ties consistently; continuity prevents side-to-side oscillation.
    for (let i = 0; i < 16; i++) {
      const offset = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 8;
      const x = Math.cos(angle + offset), y = Math.sin(angle + offset);
      if (!canMove(player, x * step, y * step, obstacles)) continue;
      let value = x * desired.x / length + y * desired.y / length + .25 * (x * this.last.x + y * this.last.y);
      for (const o of obstacles) if (segmentHitsCircle(player.x, player.y, player.x + x * 60, player.y + y * 60, o.x, o.y, o.radius + player.radius + 5)) value -= 3;
      for (const z of danger) {
        const before = Math.hypot(player.x - z.x, player.y - z.y), after = Math.hypot(player.x + x * 40 - z.x, player.y + y * 40 - z.y);
        if (after < z.radius + player.radius + 20 && after < before) value -= 4;
      }
      if (value > score + 1e-9) { score = value; best = { x, y }; }
    }
    this.last = best; return best;
  }
}

export function canMove(player: Player, dx: number, dy: number, obstacles: readonly TerrainCircle[]): boolean {
  return obstacles.every(o => {
    const radius = player.radius + o.radius;
    const before = Math.hypot(player.x - o.x, player.y - o.y);
    if (before < radius) return Math.hypot(player.x + dx - o.x, player.y + dy - o.y) > before;
    return !segmentHitsCircle(player.x, player.y, player.x + dx, player.y + dy, o.x, o.y, radius);
  });
}
