import { Pool } from './pool';
import type { PoolCheckpoint } from './pool';
import { SpatialGrid, circlesOverlap, segmentHitsCircle, expandingRingHitsCircle } from './geometry';
import { body, resetBody, SeededRandom, STEP_SECONDS, weaponSpec } from './model';
import { SonarSteering, canMove } from './SonarSteering';
import type { TerrainCircle } from './model';
import type { BattleOptions, Capacities, Effect, Enemy, FloatingText, Loot, Player, Projectile, WeaponKind, WeaponState } from './model';
import { BOSS_ENCOUNTERS, ENEMY_CATALOG, WORLD_BOUNDS, SUNLIGHT_TUNING, enemyByKey, enemyStrength, layerAtDepth } from './SeaContent';
import type { ContentProgress, SeaLayer } from './SeaContent';

export interface BattleCheckpoint {
  encounters?: string[];
  tick: number; player: Player; stats: Battle['stats']; random: number; nextSpawnTick: number;
  options: Pick<BattleOptions, 'spawn' | 'spawnIntervalTicks' | 'sunlightSpawnIntervalTicks' | 'weapons' | 'capacities' | 'obstacles' | 'dangerZones' | 'content' | 'playerSpeed' | 'pickupRadius'>;
  content?: { defeatedBosses: string[]; openRifts: SeaLayer[] };
  weapons: WeaponState[]; pools: Record<'enemies' | 'projectiles' | 'loot' | 'texts' | 'effects', PoolCheckpoint>;
}

export class Battle {
  private readonly encounters = new Set<string>();
  readonly contentEnabled: boolean;
  private readonly defeatedBosses = new Set<string>();
  private readonly openRifts = new Set<SeaLayer>();
  private readonly pickupRadius: number;
  get activeContentLayer(): SeaLayer {
    const gate = this.contentEnabled ? BOSS_ENCOUNTERS.find(b => b.gate && !this.defeatedBosses.has(b.assetKey)) : undefined;
    return gate && this.player.y === gate.depth ? gate.layer : layerAtDepth(this.player.y);
  }
  get contentProgress(): ContentProgress {
    return Object.freeze({ defeatedBosses: Object.freeze(Array.from(this.defeatedBosses)), openRifts: Object.freeze(Array.from(this.openRifts)),
      gateDepth: this.contentEnabled ? BOSS_ENCOUNTERS.find(b => b.gate && !this.defeatedBosses.has(b.assetKey))?.depth : undefined });
  }
  readonly obstacles: readonly TerrainCircle[];
  readonly dangerZones: readonly TerrainCircle[];
  private readonly steering = new SonarSteering();
  private sonar = false;
  private manual = false;
  private lowOxygen = false;
  private canCollect = true;
  get movementMode(): 'manual' | 'sonar' | 'idle' { return this.manual ? 'manual' : this.sonar ? 'sonar' : 'idle'; }
  setSonar(enabled: boolean, lowOxygen = false, canCollect = true): void { this.sonar = enabled; this.lowOxygen = lowOxygen; this.canCollect = canCollect; }
  readonly enemies: Pool<Enemy>;
  readonly projectiles: Pool<Projectile>;
  readonly loot: Pool<Loot>;
  readonly texts: Pool<FloatingText>;
  readonly effects: Pool<Effect>;
  readonly weapons: WeaponState[];
  readonly player: Player = { x: 0, y: 0, previousX: 0, previousY: 0, radius: 12, hp: 200, speed: 120 };
  readonly stats = { hits: 0, kills: 0, lootCollected: 0, deferredSpawns: 0, deferredShots: 0, targetUpdates: 0, farDecisions: 0, droppedSteps: 0, mergedLoot: 0, mergedTexts: 0, manualDistance: 0, maxDepth: 0 };
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
  private readonly onKill?: BattleOptions['onKill'];
  private readonly spawnInterval: number;
  private readonly sunlightSpawnInterval: number;
  private readonly pendingHits: { id: number; damage: number }[] = [];
  private readonly pendingDrops: { x: number; y: number; value: number }[] = [];

  constructor(options: BattleOptions = {}) {
    this.contentEnabled = options.content ?? false;
    this.pickupRadius = options.pickupRadius ?? 0;
    this.player.speed = options.playerSpeed ?? this.player.speed;
    if (![this.pickupRadius, this.player.speed].every(n => Number.isFinite(n) && n >= 0)) throw new RangeError('Invalid movement/pickup parameters');
    const terrain = (items: readonly TerrainCircle[] = []) => Object.freeze(items.map(o => {
      if (![o.x, o.y, o.radius].every(Number.isFinite) || o.radius < 0) throw new RangeError('Invalid terrain');
      return Object.freeze({ ...o });
    }));
    this.obstacles = terrain(options.obstacles); this.dangerZones = terrain(options.dangerZones);
    this.random = new SeededRandom(options.seed ?? 1);
    this.autoSpawn = options.spawn ?? true;
    this.collectLoot = options.collectLoot ?? (value => value);
    this.onKill = options.onKill;
    this.spawnInterval = options.spawnIntervalTicks ?? 15;
    this.sunlightSpawnInterval = options.sunlightSpawnIntervalTicks ?? Math.round(this.spawnInterval * SUNLIGHT_TUNING.spawnIntervalMultiplier);
    if (!Number.isSafeInteger(this.sunlightSpawnInterval) || this.sunlightSpawnInterval < 1) throw new RangeError('Invalid sunlight spawn interval');
    if (!Number.isSafeInteger(this.spawnInterval) || this.spawnInterval < 1) throw new RangeError('Invalid spawn interval');
    const caps: Capacities = { enemies: 80, projectiles: 200, loot: 100, texts: 64, effects: 64, ...options.capacities };
    this.enemies = new Pool<Enemy>(caps.enemies, () => ({ ...body(), assetKey: '', name: '', layer: 'sunlight', maxHp: 0, attack: 8, spawnDepth: 0, hp: 0, speed: 0, vx: 0, vy: 0, lootValue: 0, nextContactTick: 0, kind: 'normal' }), e => {
      resetBody(e); e.hp = e.speed = e.vx = e.vy = e.lootValue = e.nextContactTick = 0;
      e.kind = 'normal';
      e.assetKey = e.name = ''; e.layer = 'sunlight'; e.maxHp = e.spawnDepth = 0; e.attack = 8;
    });
    this.projectiles = new Pool<Projectile>(caps.projectiles, () => ({ ...body(), kind: 'torpedo' as const, vx: 0, vy: 0, damage: 0, bornTick: 0, expiresTick: 0, owner: 0, range: 0, speed: 0, innerRadius: 0, triggerRadius: 0, hits: new Set<number>() }), p => {
      resetBody(p); p.hits.clear(); p.kind = 'torpedo'; p.vx = p.vy = p.damage = p.bornTick = p.expiresTick = p.owner = p.range = p.speed = p.innerRadius = p.triggerRadius = 0;
    });
    this.loot = new Pool(caps.loot, () => ({ ...body(), value: 0 }), l => { resetBody(l); l.value = 0; });
    this.texts = new Pool(caps.texts, () => ({ ...body(), value: 0, expiresTick: 0 }), t => { resetBody(t); t.value = t.expiresTick = 0; });
    this.effects = new Pool<Effect>(caps.effects, () => ({ ...body(), kind: 'sonic' as const, endX: 0, endY: 0, expiresTick: 0 }), e => { resetBody(e); e.kind = 'sonic'; e.endX = e.endY = e.expiresTick = 0; });
    this.weapons = (options.weapons ?? [{ kind: 'sonic' }, { kind: 'torpedo' }]).map(spec => ({ spec: weaponSpec(spec), nextFireTick: 1, targetId: 0 }));
  }

  setInput(x: number, y: number, held = false): void {
    if (this.paused || !Number.isFinite(x) || !Number.isFinite(y)) { this.manual = false; this.inputX = this.inputY = 0; return; }
    this.manual = held || x !== 0 || y !== 0;
    const length = Math.max(1, Math.hypot(x, y));
    this.inputX = x / length; this.inputY = y / length;
  }

  setPaused(paused: boolean): void {
    this.manual = false;
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

  spawnEnemy(spec: { x: number; y: number; hp?: number; speed?: number; radius?: number; lootValue?: number; kind?: Enemy['kind']; assetKey?: string; spawnDepth?: number; attack?: number }): Enemy | undefined {
    if (![spec.x, spec.y, spec.hp ?? 50, spec.speed ?? 30, spec.radius ?? 10, spec.lootValue ?? 10].every(Number.isFinite)
      || (spec.hp ?? 50) <= 0 || (spec.speed ?? 30) < 0 || (spec.radius ?? 10) < 0 || (spec.lootValue ?? 10) < 0) throw new RangeError('Invalid enemy spawn');
    const identity = spec.assetKey ? enemyByKey(spec.assetKey) : undefined;
    if (spec.assetKey && !identity) throw new RangeError('Unknown enemy identity');
    const kind = identity?.kind ?? spec.kind ?? 'normal';
    if (this.contentEnabled && kind === 'boss' && identity && (this.defeatedBosses.has(identity.assetKey) || Array.from(this.enemies.values()).some(e => e.assetKey === identity.assetKey))) return undefined;
    const spawnDepth = Math.max(0, Math.min(WORLD_BOUNDS.maxDepth, spec.spawnDepth ?? spec.y));
    if (!Number.isFinite(spawnDepth) || (spec.attack !== undefined && (!Number.isFinite(spec.attack) || spec.attack < 0))) throw new RangeError('Invalid enemy strength');
    const strength = this.contentEnabled ? enemyStrength(kind, spawnDepth) : { maxHp: 50, attack: 8 };
    const e = this.enemies.acquire();
    if (!e) return undefined;
    e.x = e.previousX = spec.x; e.y = e.previousY = spec.y;
    if (this.contentEnabled) { e.x = e.previousX = this.boundX(e.x); e.y = e.previousY = this.boundDepth(e.y); }
    e.hp = e.maxHp = spec.hp ?? strength.maxHp; e.attack = spec.attack ?? strength.attack; e.spawnDepth = spawnDepth;
    e.assetKey = identity?.assetKey ?? ''; e.name = identity?.name ?? ''; e.layer = identity?.layer ?? layerAtDepth(spawnDepth);
    e.speed = spec.speed ?? 30; e.radius = spec.radius ?? (kind === 'boss' ? 40 : kind === 'elite' ? 18 : 10); e.lootValue = spec.lootValue ?? 10;
    e.kind = kind;
    if (identity) this.encounters.add(identity.assetKey);
    return e;
  }

  step(): void {
    if (this.paused) return;
    this.tick++;
    if (this.contentEnabled) this.contentSystem();
    this.spawnSystem();
    this.movementSystem();
    this.stats.maxDepth = Math.max(this.stats.maxDepth, this.player.y);
    if (this.manual) this.stats.manualDistance += Math.hypot(this.player.x - this.player.previousX, this.player.y - this.player.previousY);
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

  randomSample(): number { return this.random.next(); }
  checkpoint(): BattleCheckpoint {
    const result: BattleCheckpoint = { tick: this.tick, player: { ...this.player }, stats: { ...this.stats }, random: this.random.checkpoint(), nextSpawnTick: this.nextSpawnTick,
      encounters: Array.from(this.encounters), content: { defeatedBosses: Array.from(this.defeatedBosses), openRifts: Array.from(this.openRifts) },
      options: { content: this.contentEnabled, playerSpeed: this.player.speed, pickupRadius: this.pickupRadius, spawn: this.autoSpawn, spawnIntervalTicks: this.spawnInterval, sunlightSpawnIntervalTicks: this.sunlightSpawnInterval, weapons: this.weapons.map(w => ({ ...w.spec })), obstacles: this.obstacles, dangerZones: this.dangerZones,
        capacities: { enemies: this.enemies.capacity, projectiles: this.projectiles.capacity, loot: this.loot.capacity, texts: this.texts.capacity, effects: this.effects.capacity } },
      weapons: this.weapons.map(w => ({ ...w, spec: { ...w.spec } })),
      pools: { enemies: this.enemies.checkpoint(), projectiles: this.projectiles.checkpoint(p => ({ ...p, hits: Array.from(p.hits) })),
        loot: this.loot.checkpoint(), texts: this.texts.checkpoint(), effects: this.effects.checkpoint() } };
    return JSON.parse(JSON.stringify(result));
  }
  restore(saved: BattleCheckpoint): void {
    if (!saved || !Number.isSafeInteger(saved.tick) || saved.tick < 0 || !Number.isSafeInteger(saved.nextSpawnTick) || saved.nextSpawnTick < 1) throw new RangeError('Invalid battle checkpoint');
    this.tick = saved.tick; this.nextSpawnTick = saved.nextSpawnTick; this.random.restore(saved.random);
    Object.assign(this.player, saved.player); Object.assign(this.stats, saved.stats);
    this.weapons.splice(0, this.weapons.length, ...saved.weapons.map(w => ({ ...w, spec: { ...w.spec } })));
    this.enemies.restore(saved.pools.enemies, value => {
      const e = value as Enemy;
      return { ...e, assetKey: e.assetKey ?? '', name: e.name ?? '', layer: e.layer ?? layerAtDepth(e.y),
        maxHp: e.maxHp ?? e.hp, attack: e.attack ?? 8, spawnDepth: e.spawnDepth ?? Math.max(0, Math.min(WORLD_BOUNDS.maxDepth, e.y)) };
    });
    this.loot.restore(saved.pools.loot); this.texts.restore(saved.pools.texts); this.effects.restore(saved.pools.effects);
    this.defeatedBosses.clear(); this.openRifts.clear();
    this.encounters.clear();
    for (const key of saved.encounters ?? []) { if (!enemyByKey(key)) throw new RangeError('Invalid encounter'); this.encounters.add(key); }
    for (const key of saved.content?.defeatedBosses ?? []) {
      if (!BOSS_ENCOUNTERS.some(b => b.assetKey === key)) throw new RangeError('Invalid defeated boss');
      this.defeatedBosses.add(key);
    }
    for (const layer of saved.content?.openRifts ?? []) {
      if (!BOSS_ENCOUNTERS.some(b => b.gate && b.layer === layer && this.defeatedBosses.has(b.assetKey))) throw new RangeError('Invalid open rift');
      this.openRifts.add(layer);
    }
    this.projectiles.restore(saved.pools.projectiles, value => {
      const p = value as Omit<Projectile, 'hits'> & { hits: number[] }; return { ...p, hits: new Set(p.hits) };
    });
    this.accumulator = 0; this.inputX = this.inputY = 0; this.grid.rebuild(this.enemies.values(), true);
  }

  private spawnSystem(): void {
    if (!this.autoSpawn || this.tick < this.nextSpawnTick) return;
    if (this.enemies.size === this.enemies.capacity) { this.stats.deferredSpawns++; return; }
    const angle = this.random.next() * Math.PI * 2, distance = 300 + this.random.next() * 100;
    const layer = this.activeContentLayer;
    const interval = this.contentEnabled && layer === 'sunlight' ? this.sunlightSpawnInterval : this.spawnInterval;
    const candidates = this.contentEnabled ? ENEMY_CATALOG.filter(e => e.layer === layer && e.kind === (this.tick > 1 && Math.floor(this.tick / interval) % 6 === 5 ? 'elite' : 'normal')) : [];
    const identity = candidates.length ? candidates[Math.floor(this.random.next() * candidates.length)] : undefined;
    this.spawnEnemy({ x: this.player.x + Math.cos(angle) * distance, y: this.player.y + Math.sin(angle) * distance, assetKey: identity?.assetKey, spawnDepth: this.player.y });
    this.nextSpawnTick = this.tick + interval;
  }

  private movementSystem(): void {
    const player = this.player;
    player.previousX = player.x; player.previousY = player.y;
    const v = this.sonar && !this.manual ? this.steering.direction(player, this.enemies.values(), this.loot.values(), this.obstacles, this.dangerZones, this.lowOxygen, this.canCollect) : { x: this.inputX, y: this.inputY };
    const dx = v.x * player.speed * STEP_SECONDS, dy = v.y * player.speed * STEP_SECONDS;
    if (canMove(player, dx, dy, this.obstacles)) { player.x += dx; player.y += dy; }
    else if (canMove(player, dx, 0, this.obstacles)) player.x += dx;
    else if (canMove(player, 0, dy, this.obstacles)) player.y += dy;
    if (this.contentEnabled) { player.x = this.boundX(player.x); player.y = Math.min(this.boundDepth(player.y), this.contentProgress.gateDepth ?? WORLD_BOUNDS.maxDepth); }
    for (const e of this.enemies.values()) {
      e.previousX = e.x; e.previousY = e.y;
      const dx = player.x - e.x, dy = player.y - e.y, distance = Math.hypot(dx, dy);
      if (distance < 240 || this.tick % 3 === 1) {
        if (distance >= 240) this.stats.farDecisions++;
        e.vx = distance ? dx / distance * e.speed : 0; e.vy = distance ? dy / distance * e.speed : 0;
      }
      const fraction = Math.min(STEP_SECONDS, e.speed > 0 ? distance / e.speed : STEP_SECONDS);
      e.x += e.vx * fraction; e.y += e.vy * fraction;
      if (this.contentEnabled) { e.x = this.boundX(e.x); e.y = this.boundDepth(e.y); }
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
      const target = this.enemies.get(weapon.targetId) ?? (this.contentEnabled ? this.nearest(this.player.x, this.player.y, spec.range) : undefined);
      if (target) weapon.targetId = target.id;
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
        // Contact i-frames 1s→1.5s (LOO-58): sustained add pressure dealt ~4-6 hp/s to a
        // 200-280 HP pool in 60-dive trajectories, ending dives before the oxygen economy
        // could ever engage; 45 ticks halves sustained contact DPS and gives evasion real value.
        this.player.hp = Math.max(0, this.player.hp - e.attack); e.nextContactTick = this.tick + 45;
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
      if (this.contentEnabled && e.kind === 'boss' && e.assetKey) {
        if (this.defeatedBosses.has(e.assetKey)) { this.enemies.release(id); return; }
        this.defeatedBosses.add(e.assetKey);
        const encounter = BOSS_ENCOUNTERS.find(b => b.assetKey === e.assetKey);
        if (encounter?.gate) this.openRifts.add(encounter.layer);
      }
      this.pendingDrops.push({ x: e.x, y: e.y, value: this.onKill?.(e) ?? e.lootValue });
      this.enemies.release(id);
    }
  }

  private lootSystem(): void {
    for (const drop of this.pendingDrops) this.addLoot(drop.x, drop.y, drop.value);
    this.pendingDrops.length = 0;
    for (const l of this.loot.values()) if (circlesOverlap(this.player.x, this.player.y, this.player.radius + this.pickupRadius, l.x, l.y, l.radius)) {
      const accepted = this.collectLoot(l.value);
      if (!Number.isFinite(accepted) || accepted < 0 || accepted > l.value) throw new RangeError('Invalid accepted loot');
      this.stats.lootCollected += accepted; l.value -= accepted;
      if (l.value <= 0) this.loot.release(l.id);
    }
  }

  private boundX(x: number): number { return Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, x)); }
  private boundDepth(y: number): number { return Math.max(0, Math.min(WORLD_BOUNDS.maxDepth, y)); }
  private contentSystem(): void {
    this.player.x = this.boundX(this.player.x);
    this.player.y = Math.min(this.boundDepth(this.player.y), this.contentProgress.gateDepth ?? WORLD_BOUNDS.maxDepth);
    const layer = this.activeContentLayer;
    for (const e of this.enemies.values()) {
      if (e.layer === layer) continue;
      const boundaryBoss = e.kind === 'boss' && BOSS_ENCOUNTERS.some(b => b.assetKey === e.assetKey && b.gate && b.depth === this.player.y);
      if (!boundaryBoss) this.enemies.release(e.id);
    }
    if (!this.autoSpawn) return;
    for (const boss of BOSS_ENCOUNTERS) {
      if (this.defeatedBosses.has(boss.assetKey) || this.player.y < boss.depth - 100 || this.player.y > boss.depth + 100) continue;
      // Reserve a slot for the gate even when ambient spawns fill the pool.
      if (!Array.from(this.enemies.values()).some(e => e.assetKey === boss.assetKey) && this.enemies.size === this.enemies.capacity) {
        const ambient = Array.from(this.enemies.values()).find(e => e.kind !== 'boss');
        if (ambient) this.enemies.release(ambient.id);
      }
      this.spawnEnemy({ x: 0, y: boss.depth - 40, assetKey: boss.assetKey, spawnDepth: boss.depth - 100, speed: 18 });
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
