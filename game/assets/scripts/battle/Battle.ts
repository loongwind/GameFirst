import { Pool } from './pool';
import { SpatialGrid, circlesOverlap, segmentHitsCircle, expandingRingHitsCircle } from './geometry';
import { body, resetBody, SeededRandom, STEP_SECONDS, weaponSpec } from './model';
import type { BattleOptions, Capacities, Effect, Enemy, FloatingText, Loot, Player, Projectile, WeaponKind, WeaponState } from './model';

export class Battle {
  readonly enemies: Pool<Enemy>;
  readonly projectiles: Pool<Projectile>;
  readonly loot: Pool<Loot>;
  readonly texts: Pool<FloatingText>;
  readonly effects: Pool<Effect>;
  readonly weapons: WeaponState[];
  readonly player: Player = { x: 0, y: 0, previousX: 0, previousY: 0, radius: 12, hp: 200, speed: 120 };
  readonly stats = { hits: 0, kills: 0, lootCollected: 0, deferredSpawns: 0, deferredShots: 0, targetUpdates: 0, farDecisions: 0, droppedSteps: 0, mergedLoot: 0, mergedTexts: 0 };
  tick = 0;
  private accumulator = 0;
  private paused = false;
  private inputX = 0;
  private inputY = 0;
  private nextSpawnTick = 1;
  private readonly random: SeededRandom;
  private readonly grid = new SpatialGrid<Enemy>();
  private readonly autoSpawn: boolean;
  private readonly collectLoot: (value: number) => number;
  private readonly spawnInterval: number;
  private readonly pendingHits: { id: number; damage: number }[] = [];
  private readonly pendingDrops: { x: number; y: number; value: number }[] = [];

  constructor(options: BattleOptions = {}) {
    this.random = new SeededRandom(options.seed ?? 1);
    this.autoSpawn = options.spawn ?? true;
    this.collectLoot = options.collectLoot ?? (value => value);
    this.spawnInterval = options.spawnIntervalTicks ?? 15;
    if (!Number.isSafeInteger(this.spawnInterval) || this.spawnInterval < 1) throw new RangeError('Invalid spawn interval');
    const caps: Capacities = { enemies: 80, projectiles: 200, loot: 100, texts: 64, effects: 64, ...options.capacities };
    this.enemies = new Pool(caps.enemies, () => ({ ...body(), hp: 0, speed: 0, vx: 0, vy: 0, lootValue: 0, nextContactTick: 0 }), e => {
      resetBody(e); e.hp = e.speed = e.vx = e.vy = e.lootValue = e.nextContactTick = 0;
    });
    this.projectiles = new Pool<Projectile>(caps.projectiles, () => ({ ...body(), kind: 'torpedo' as const, vx: 0, vy: 0, damage: 0, bornTick: 0, expiresTick: 0, owner: 0, range: 0, speed: 0, innerRadius: 0, triggerRadius: 0, hits: new Set<number>() }), p => {
      resetBody(p); p.hits.clear(); p.kind = 'torpedo'; p.vx = p.vy = p.damage = p.bornTick = p.expiresTick = p.owner = p.range = p.speed = p.innerRadius = p.triggerRadius = 0;
    });
    this.loot = new Pool(caps.loot, () => ({ ...body(), value: 0 }), l => { resetBody(l); l.value = 0; });
    this.texts = new Pool(caps.texts, () => ({ ...body(), value: 0, expiresTick: 0 }), t => { resetBody(t); t.value = t.expiresTick = 0; });
    this.effects = new Pool<Effect>(caps.effects, () => ({ ...body(), kind: 'sonic' as const, endX: 0, endY: 0, expiresTick: 0 }), e => { resetBody(e); e.kind = 'sonic'; e.endX = e.endY = e.expiresTick = 0; });
    this.weapons = (options.weapons ?? [{ kind: 'sonic' }, { kind: 'torpedo' }]).map(spec => ({ spec: weaponSpec(spec), nextFireTick: 1, targetId: 0 }));
  }

  setInput(x: number, y: number): void {
    if (this.paused || !Number.isFinite(x) || !Number.isFinite(y)) { this.inputX = this.inputY = 0; return; }
    const length = Math.max(1, Math.hypot(x, y));
    this.inputX = x / length; this.inputY = y / length;
  }

  setPaused(paused: boolean): void {
    this.paused = paused; this.accumulator = 0; this.inputX = this.inputY = 0;
    this.player.previousX = this.player.x; this.player.previousY = this.player.y;
    for (const pool of [this.enemies, this.projectiles, this.loot, this.texts, this.effects]) {
      for (const item of pool.values()) { item.previousX = item.x; item.previousY = item.y; }
    }
  }

  advance(seconds: number): { steps: number; alpha: number; droppedSteps: number } {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid elapsed time');
    if (this.paused) return { steps: 0, alpha: 0, droppedSteps: 0 };
    const total = this.accumulator + seconds;
    const due = Math.floor((total + 1e-10) / STEP_SECONDS);
    if (!Number.isSafeInteger(due)) throw new RangeError('Elapsed time exceeds clock precision');
    const count = Math.min(due, 3), dropped = due - count;
    this.accumulator = Math.max(0, total - due * STEP_SECONDS);
    for (let i = 0; i < count; i++) this.step();
    this.stats.droppedSteps += dropped;
    return { steps: count, alpha: this.accumulator / STEP_SECONDS, droppedSteps: dropped };
  }

  samplePlayer(alpha: number): { x: number; y: number } {
    const t = Math.max(0, Math.min(1, alpha));
    return { x: this.player.previousX + (this.player.x - this.player.previousX) * t, y: this.player.previousY + (this.player.y - this.player.previousY) * t };
  }

  spawnEnemy(spec: { x: number; y: number; hp?: number; speed?: number; radius?: number; lootValue?: number }): Enemy | undefined {
    if (![spec.x, spec.y, spec.hp ?? 50, spec.speed ?? 30, spec.radius ?? 10, spec.lootValue ?? 10].every(Number.isFinite)
      || (spec.hp ?? 50) <= 0 || (spec.speed ?? 30) < 0 || (spec.radius ?? 10) < 0 || (spec.lootValue ?? 10) < 0) throw new RangeError('Invalid enemy spawn');
    const e = this.enemies.acquire();
    if (!e) return undefined;
    e.x = e.previousX = spec.x; e.y = e.previousY = spec.y;
    e.hp = spec.hp ?? 50; e.speed = spec.speed ?? 30; e.radius = spec.radius ?? 10; e.lootValue = spec.lootValue ?? 10;
    return e;
  }

  step(): void {
    if (this.paused) return;
    this.tick++;
    this.spawnSystem();
    this.movementSystem();
    this.grid.rebuild(this.enemies.values(), true);
    this.targetingSystem();
    this.weaponSystem();
    this.hitSystem();
    this.lootSystem();
  }

  dispose(): void {
    this.setPaused(true);
    for (const pool of [this.enemies, this.projectiles, this.loot, this.texts, this.effects]) pool.clear();
    for (const weapon of this.weapons) weapon.targetId = 0;
    this.pendingHits.length = this.pendingDrops.length = 0;
    this.grid.rebuild([]);
  }

  private spawnSystem(): void {
    if (!this.autoSpawn || this.tick < this.nextSpawnTick) return;
    if (this.enemies.size === this.enemies.capacity) { this.stats.deferredSpawns++; return; }
    const angle = this.random.next() * Math.PI * 2, distance = 300 + this.random.next() * 100;
    this.spawnEnemy({ x: this.player.x + Math.cos(angle) * distance, y: this.player.y + Math.sin(angle) * distance });
    this.nextSpawnTick = this.tick + this.spawnInterval;
  }

  private movementSystem(): void {
    const player = this.player;
    player.previousX = player.x; player.previousY = player.y;
    player.x += this.inputX * player.speed * STEP_SECONDS; player.y += this.inputY * player.speed * STEP_SECONDS;
    for (const e of this.enemies.values()) {
      e.previousX = e.x; e.previousY = e.y;
      const dx = player.x - e.x, dy = player.y - e.y, distance = Math.hypot(dx, dy);
      if (distance < 240 || this.tick % 3 === 1) {
        if (distance >= 240) this.stats.farDecisions++;
        e.vx = distance ? dx / distance * e.speed : 0; e.vy = distance ? dy / distance * e.speed : 0;
      }
      const fraction = Math.min(STEP_SECONDS, e.speed > 0 ? distance / e.speed : STEP_SECONDS);
      e.x += e.vx * fraction; e.y += e.vy * fraction;
    }
    for (const p of this.projectiles.values()) {
      if (this.tick >= p.expiresTick) { this.projectiles.release(p.id); continue; }
      p.previousX = p.x; p.previousY = p.y;
      if (p.kind === 'torpedo') { p.x += p.vx * STEP_SECONDS; p.y += p.vy * STEP_SECONDS; }
      if (p.kind === 'sonic') { p.innerRadius = p.radius; p.radius = Math.min(p.range, p.radius + p.speed * STEP_SECONDS); }
    }
    for (const t of this.texts.values()) {
      if (this.tick >= t.expiresTick) { this.texts.release(t.id); continue; }
      t.previousX = t.x; t.previousY = t.y; t.y -= 20 * STEP_SECONDS;
    }
    for (const e of this.effects.values()) if (this.tick >= e.expiresTick) this.effects.release(e.id);
  }

  private targetingSystem(): void {
    if (this.tick % 3 !== 1) return;
    this.stats.targetUpdates++;
    for (const weapon of this.weapons) weapon.targetId = this.nearest(this.player.x, this.player.y, weapon.spec.range)?.id ?? 0;
  }

  private nearest(x: number, y: number, range: number, excluded?: Set<number>): Enemy | undefined {
    let best: Enemy | undefined, bestDistance = Infinity;
    for (const e of this.grid.query(x - range, y - range, x + range, y + range)) {
      if (!e.active || e.hp <= 0 || excluded?.has(e.id)) continue;
      const distance = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (distance <= range ** 2 && (distance < bestDistance || (distance === bestDistance && e.id < (best?.id ?? Infinity)))) {
        best = e; bestDistance = distance;
      }
    }
    return best;
  }

  private weaponSystem(): void {
    for (let index = 0; index < this.weapons.length; index++) {
      const weapon = this.weapons[index], spec = weapon.spec;
      if (this.tick < weapon.nextFireTick) continue;
      const target = this.enemies.get(weapon.targetId);
      if (!target || target.hp <= 0 || !circlesOverlap(this.player.x, this.player.y, spec.range, target.x, target.y, 0)) continue;
      if (spec.kind === 'arc') {
        const visited = new Set<number>();
        let current: Enemy | undefined = target, x = this.player.x, y = this.player.y;
        for (let hop = 0; hop < spec.maxJumps && current; hop++) {
          visited.add(current.id);
          this.pendingHits.push({ id: current.id, damage: spec.damage });
          this.addEffect('arc', x, y, current.x, current.y, 0, spec.lifetimeTicks);
          x = current.x; y = current.y;
          current = this.nearest(x, y, spec.chainRange, visited);
        }
      } else {
        if (spec.kind === 'mine') {
          let count = 0;
          for (const p of this.projectiles.values()) if (p.kind === 'mine' && p.owner === index) count++;
          if (count >= spec.maxActive) { this.stats.deferredShots++; continue; }
        }
        const p = this.projectiles.acquire();
        if (!p) { this.stats.deferredShots++; continue; }
        p.kind = spec.kind; p.x = p.previousX = this.player.x; p.y = p.previousY = this.player.y;
        p.owner = index; p.damage = spec.damage; p.bornTick = this.tick; p.expiresTick = this.tick + spec.lifetimeTicks;
        p.range = spec.range; p.speed = spec.speed; p.triggerRadius = spec.triggerRadius;
        p.radius = spec.radius;
        if (spec.kind === 'torpedo') {
          const dx = target.x - p.x, dy = target.y - p.y, length = Math.hypot(dx, dy);
          p.vx = length ? dx / length * spec.speed : spec.speed; p.vy = length ? dy / length * spec.speed : 0;
          p.x += p.vx * STEP_SECONDS; p.y += p.vy * STEP_SECONDS;
        }
        if (spec.kind === 'sonic') { p.innerRadius = 0; p.radius = Math.min(spec.range, spec.speed * STEP_SECONDS); }
      }
      weapon.nextFireTick = this.tick + spec.cooldownTicks;
    }
  }

  private hitSystem(): void {
    for (const hit of this.pendingHits) this.damage(hit.id, hit.damage);
    this.pendingHits.length = 0;
    for (const p of this.projectiles.values()) {
      const reach = p.kind === 'mine' ? Math.max(p.radius, p.triggerRadius) : p.radius;
      const candidates = this.grid.query(Math.min(p.x, p.previousX) - reach, Math.min(p.y, p.previousY) - reach,
        Math.max(p.x, p.previousX) + reach, Math.max(p.y, p.previousY) + reach);
      if (p.kind === 'mine') {
        const triggered = candidates.some(e => e.active && e.hp > 0 && circlesOverlap(p.x, p.y, p.triggerRadius, e.x, e.y, e.radius));
        if (!triggered) continue;
        for (const e of candidates) if (e.active && e.hp > 0 && circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius)) this.damage(e.id, p.damage);
        this.addEffect('mine', p.x, p.y, p.x, p.y, p.radius, 8);
        this.projectiles.release(p.id);
        continue;
      }
      for (const e of candidates) {
        if (!e.active || e.hp <= 0 || p.hits.has(e.id)) continue;
        let hit: boolean;
        if (p.kind === 'torpedo') {
          // Relative motion catches crossing targets, not just their end positions.
          hit = segmentHitsCircle(p.previousX - e.previousX, p.previousY - e.previousY, p.x - e.x, p.y - e.y, 0, 0, p.radius + e.radius);
        } else {
          hit = expandingRingHitsCircle(e.previousX - p.x, e.previousY - p.y, e.x - p.x, e.y - p.y, e.radius, p.innerRadius, p.radius);
        }
        if (hit) { p.hits.add(e.id); this.damage(e.id, p.damage); }
      }
      if (p.kind === 'sonic' && p.radius >= p.range) this.projectiles.release(p.id);
    }
    for (const e of this.grid.query(this.player.x - this.player.radius, this.player.y - this.player.radius, this.player.x + this.player.radius, this.player.y + this.player.radius)) {
      if (e.active && this.tick >= e.nextContactTick && circlesOverlap(this.player.x, this.player.y, this.player.radius, e.x, e.y, e.radius)) {
        this.player.hp = Math.max(0, this.player.hp - 8); e.nextContactTick = this.tick + 30;
      }
    }
  }

  private damage(id: number, amount: number): void {
    const e = this.enemies.get(id);
    if (!e || e.hp <= 0) return;
    e.hp -= amount; this.stats.hits++;
    this.addText(e.x, e.y, amount);
    if (e.hp <= 0) {
      this.stats.kills++;
      this.pendingDrops.push({ x: e.x, y: e.y, value: e.lootValue });
      this.enemies.release(id);
    }
  }

  private lootSystem(): void {
    for (const drop of this.pendingDrops) this.addLoot(drop.x, drop.y, drop.value);
    this.pendingDrops.length = 0;
    for (const l of this.loot.values()) if (circlesOverlap(this.player.x, this.player.y, this.player.radius, l.x, l.y, l.radius)) {
      const accepted = this.collectLoot(l.value);
      if (!Number.isFinite(accepted) || accepted < 0 || accepted > l.value) throw new RangeError('Invalid accepted loot');
      this.stats.lootCollected += accepted; l.value -= accepted;
      if (l.value <= 0) this.loot.release(l.id);
    }
  }

  /** Spawn/merge preserves the total value even when the pool is full. */
  addLoot(x: number, y: number, value: number): void {
    if (![x, y, value].every(Number.isFinite) || value < 0) throw new RangeError('Invalid loot');
    const l = this.loot.acquire();
    if (l) { l.x = l.previousX = x; l.y = l.previousY = y; l.value = value; l.radius = 4; return; }
    let nearest: Loot | undefined, distance = Infinity;
    for (const item of this.loot.values()) {
      const d = (item.x - x) ** 2 + (item.y - y) ** 2;
      if (d < distance) { distance = d; nearest = item; }
    }
    if (nearest) { nearest.value += value; this.stats.mergedLoot++; }
  }

  private addText(x: number, y: number, value: number): void {
    let t = this.texts.acquire();
    if (!t) {
      let distance = Infinity;
      for (const item of this.texts.values()) {
        const d = (item.x - x) ** 2 + (item.y - y) ** 2;
        if (d < distance) { distance = d; t = item; }
      }
      if (t) { t.value += value; t.expiresTick = this.tick + 20; this.stats.mergedTexts++; }
    } else { t.x = t.previousX = x; t.y = t.previousY = y; t.value = value; t.expiresTick = this.tick + 20; }
  }

  private addEffect(kind: WeaponKind, x: number, y: number, endX: number, endY: number, radius: number, lifetime: number): void {
    const e = this.effects.acquire();
    if (!e) return; // Damage has its own queue; decoration cannot suppress a real hit.
    e.kind = kind; e.x = e.previousX = x; e.y = e.previousY = y; e.endX = endX; e.endY = endY;
    e.radius = radius; e.expiresTick = this.tick + lifetime;
  }
}
