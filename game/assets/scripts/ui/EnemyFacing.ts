import type { SeaLayer } from '../battle/SeaContent';

/** Identities whose art is radial/front-view (direction-audit.csv): they keep a front view
 *  and lean into motion (≤8°) instead of mirroring, so a player reversing can never make
 *  them jitter left-right. Every other identity mirrors by real horizontal velocity. */
export const FRONT_FACING_IDENTITIES: ReadonlySet<string> = new Set([
  'enemy_normal_01_moon_jelly', 'enemy_normal_08_comb_jelly', 'enemy_normal_15_ghost_jelly',
  'enemy_normal_19_tube_worm', 'enemy_normal_21_siphonophore', 'enemy_normal_22_sea_spider',
  'enemy_normal_23_deep_starfish', 'enemy_normal_24_glass_sponge', 'enemy_elite_04_royal_jelly',
]);

export function isFrontFacing(assetKey: string): boolean { return FRONT_FACING_IDENTITIES.has(assetKey); }

export const FACING_SPEED_THRESHOLD = 6; // world units/second of real velocity
/** Intent must persist 80ms; 30Hz steps round up to 3 ticks. Flips are at least 120ms
 *  apart (4 ticks). Both round up on purpose: jitter protection errs toward calm. */
export const FLIP_CONFIRM_TICKS = 3;
export const FLIP_COOLDOWN_TICKS = 4;

export interface FacingMemory { facing: 1 | -1; candidate: 0 | 1 | -1; sinceTick: number; lastFlipTick: number; flipTick?: number }

/** New actors face their target; source art heads right, so an ambiguous offset keeps right. */
export function initialFacing(targetDx: number): 1 | -1 { return targetDx >= -12 ? 1 : -1; }

export function facingMemory(targetDx: number): FacingMemory {
  return { facing: initialFacing(targetDx), candidate: 0, sinceTick: Number.NaN, lastFlipTick: Number.NEGATIVE_INFINITY };
}

/** Heading from the enemy's real displacement (never input or player position), so contact
 *  at a wall cannot spin an enemy: |vx| under the threshold keeps the previous heading,
 *  an opposite intent must hold for FLIP_CONFIRM_TICKS and respect FLIP_COOLDOWN_TICKS.
 *  flipTick records when a flip happened so presentation can ease the mirror in. */
export function updateFacing(memory: FacingMemory, vx: number, tick: number): 1 | -1 {
  const intent: 0 | 1 | -1 = vx > FACING_SPEED_THRESHOLD ? 1 : vx < -FACING_SPEED_THRESHOLD ? -1 : 0;
  if (intent === 0 || intent === memory.facing) { memory.candidate = 0; return memory.facing; }
  if (memory.candidate === intent) {
    if (tick - memory.sinceTick >= FLIP_CONFIRM_TICKS && tick - memory.lastFlipTick >= FLIP_COOLDOWN_TICKS) {
      memory.facing = intent;
      memory.candidate = 0;
      memory.lastFlipTick = tick;
      memory.flipTick = tick;
    }
  } else {
    memory.candidate = intent;
    memory.sinceTick = tick;
  }
  return memory.facing;
}

/** Visual flip easing (LOO-70 rework #4): squeeze the old heading to 0 over SQUEEZE_TICKS,
 *  then expand the new heading over the same span — never interpolating through zero long
 *  enough to read as paper-thin, and the logical heading flips instantly as before. */
export const SQUEEZE_TICKS = 3; // 100ms per phase at the fixed 30Hz clock
export function flipScaleX(memory: FacingMemory, facing: 1 | -1, continuousTick: number): number {
  const flip = memory.flipTick;
  if (flip === undefined) return facing;
  const t = continuousTick - flip;
  if (t <= 0) return -facing;
  if (t >= SQUEEZE_TICKS * 2) return facing;
  if (t < SQUEEZE_TICKS) return -facing * (1 - t / SQUEEZE_TICKS);
  const progress = (t - SQUEEZE_TICKS) / SQUEEZE_TICKS;
  return facing * Math.max(0.12, progress);
}

/** Radial identities lean into horizontal motion instead of mirroring, at most 8°. */
export function frontTilt(vx: number): number {
  return Math.max(-1, Math.min(1, vx / 60)) * 8;
}

export type FacingLayer = SeaLayer;
