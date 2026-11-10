import type { Pooled } from './pool';

export interface Body extends Pooled { x: number; y: number; previousX: number; previousY: number; radius: number }
export interface Enemy extends Body {
  hp: number; speed: number; vx: number; vy: number; lootValue: number; nextContactTick: number;
  kind: 'normal' | 'elite' | 'boss';
}
export type WeaponKind = 'sonic' | 'torpedo' | 'arc' | 'mine';
export interface WeaponSpec {
  kind: WeaponKind;
  cooldownTicks: number; range: number; damage: number; speed: number; radius: number;
  lifetimeTicks: number; maxJumps: number; chainRange: number; triggerRadius: number; maxActive: number;
}
export type WeaponInput = Pick<WeaponSpec, 'kind'> & Partial<Omit<WeaponSpec, 'kind'>>;
export interface WeaponState { spec: WeaponSpec; nextFireTick: number; targetId: number }
export interface Projectile extends Body {
  kind: Exclude<WeaponKind, 'arc'>; vx: number; vy: number; damage: number;
  bornTick: number; expiresTick: number; owner: number; range: number; speed: number;
  innerRadius: number; triggerRadius: number; hits: Set<number>;
}
export interface Loot extends Body { value: number }
export interface FloatingText extends Body { value: number; expiresTick: number }
export interface Effect extends Body { endX: number; endY: number; expiresTick: number; kind: WeaponKind }
export interface Player { x: number; y: number; previousX: number; previousY: number; radius: number; hp: number; speed: number }
export interface Capacities { enemies: number; projectiles: number; loot: number; texts: number; effects: number }
export interface BattleOptions {
  /** Returns the amount accepted by the hold; overflow stays in the world. */
  collectLoot?: (value: number) => number;
  onKill?: (enemy: Readonly<Enemy>) => number | undefined;
  seed?: number; spawn?: boolean; spawnIntervalTicks?: number; weapons?: WeaponInput[]; capacities?: Partial<Capacities>;
}
export const STEP_SECONDS = 1 / 30;
export const WEAPON_DEFAULTS: Readonly<Record<WeaponKind, Readonly<WeaponSpec>>> = {
  sonic: { kind: 'sonic', cooldownTicks: 45, range: 180, damage: 20, speed: 240, radius: 0, lifetimeTicks: 24, maxJumps: 1, chainRange: 0, triggerRadius: 0, maxActive: 8 },
  torpedo: { kind: 'torpedo', cooldownTicks: 15, range: 400, damage: 20, speed: 420, radius: 4, lifetimeTicks: 60, maxJumps: 1, chainRange: 0, triggerRadius: 0, maxActive: 200 },
  arc: { kind: 'arc', cooldownTicks: 30, range: 200, damage: 20, speed: 0, radius: 0, lifetimeTicks: 6, maxJumps: 4, chainRange: 90, triggerRadius: 0, maxActive: 1 },
  mine: { kind: 'mine', cooldownTicks: 60, range: 200, damage: 35, speed: 0, radius: 70, lifetimeTicks: 150, maxJumps: 1, chainRange: 0, triggerRadius: 28, maxActive: 4 },
};

export function weaponSpec(input: WeaponInput): WeaponSpec {
  if (!WEAPON_DEFAULTS[input.kind]) throw new RangeError('Unknown weapon');
  const spec = { ...WEAPON_DEFAULTS[input.kind], ...input };
  for (const key of Object.keys(spec) as (keyof WeaponSpec)[]) {
    const value = spec[key];
    if (key !== 'kind' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new RangeError(`Invalid weapon ${key}`);
  }
  for (const key of ['cooldownTicks', 'lifetimeTicks', 'maxJumps', 'maxActive'] as const) {
    if (!Number.isSafeInteger(spec[key]) || spec[key] < 1) throw new RangeError(`Invalid weapon ${key}`);
  }
  if (spec.range <= 0 || ((spec.kind === 'torpedo' || spec.kind === 'sonic') && spec.speed <= 0)) throw new RangeError('Invalid weapon range/speed');
  return spec;
}

export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new RangeError('Invalid seed');
    this.state = seed >>> 0 || 0x6d2b79f5;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
  checkpoint(): number { return this.state; }
  restore(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('Invalid random state');
    this.state = value;
  }
}

export function body(): Body { return { id: 0, active: false, x: 0, y: 0, previousX: 0, previousY: 0, radius: 0 }; }
export function resetBody(item: Body): void { item.x = item.y = item.previousX = item.previousY = item.radius = 0; }
