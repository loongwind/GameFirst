import { Battle } from './Battle';
import { STEP_SECONDS } from './model';
import type { BattleOptions } from './model';
import { PauseManager } from './PauseManager';

export type DiveState = 'Running' | 'RescuePending' | 'Returning' | 'PendingSettlement' | 'Settled';
export type Material = 'crystal' | 'pearl' | 'marrow' | 'core';
export type Cargo = Readonly<Record<Material, number>>;
export interface DiveOptions {
  diveId: string;
  battle?: Omit<BattleOptions, 'collectLoot'>;
  oxygenCapacity?: number;
  cargoCapacity?: number;
  maxHp?: number;
  oxygenBaseRate?: number;
  oxygenDepthIncrement?: number;
}
export interface DiveSnapshot {
  readonly diveId: string; readonly state: DiveState; readonly depth: number;
  readonly oxygen: number; readonly oxygenCapacity: number;
  readonly hp: number; readonly maxHp: number; readonly cargo: Cargo; readonly cargoCapacity: number;
  readonly activeSeconds: number; readonly countdown: number; readonly pauseReasons: readonly string[];
}
export interface Settlement {
  readonly diveId: string; readonly reason: 'return' | 'death' | 'disconnect';
  readonly cargo: Cargo; readonly activeSeconds: number; readonly depth: number;
}

function nonnegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid nonnegative number');
}

/** Owns the active clock. No platform clock, wallet, ad or UI dependencies. */
export class DiveSession {
  readonly battle: Battle;
  readonly pause: PauseManager;
  readonly diveId: string;
  readonly oxygenCapacity: number;
  readonly cargoCapacity: number;
  readonly maxHp: number;
  private currentState: DiveState = 'Running';
  private cargo: Record<Material, number> = { crystal: 0, pearl: 0, marrow: 0, core: 0 };
  private oxygen: number;
  private activeSeconds = 0;
  private accumulator = 0;
  private countdown = 0;
  private disconnectedAt: number | undefined;
  private frozenDeath: DiveSnapshot | undefined;
  private settlement: Settlement | undefined;
  private returnReason: Settlement['reason'] = 'return';
  private readonly baseRate: number;
  private readonly depthIncrement: number;

  constructor(options: DiveOptions) {
    if (!options.diveId.trim()) throw new RangeError('Missing diveId');
    this.diveId = options.diveId;
    this.oxygenCapacity = options.oxygenCapacity ?? 120;
    this.cargoCapacity = options.cargoCapacity ?? 300;
    this.maxHp = options.maxHp ?? 200;
    this.baseRate = options.oxygenBaseRate ?? 1;
    this.depthIncrement = options.oxygenDepthIncrement ?? 0.2;
    for (const n of [this.oxygenCapacity, this.cargoCapacity, this.maxHp, this.baseRate]) {
      if (!Number.isFinite(n) || n <= 0) throw new RangeError('Invalid dive capacity/rate');
    }
    nonnegative(this.depthIncrement);
    this.oxygen = this.oxygenCapacity;
    this.battle = new Battle({ ...options.battle, collectLoot: value => this.collect('crystal', value) });
    this.battle.player.hp = this.maxHp;
    this.pause = new PauseManager(() => this.syncPause());
  }

  get state(): DiveState { return this.currentState; }
  get depth(): number { return Math.max(0, this.battle.player.y); }
  get deathSnapshot(): DiveSnapshot | undefined { return this.frozenDeath; }
  get pendingSettlement(): Settlement | undefined { return this.settlement; }
  get snapshot(): DiveSnapshot {
    return Object.freeze({ diveId: this.diveId, state: this.state, depth: this.depth,
      oxygen: this.oxygen, oxygenCapacity: this.oxygenCapacity, hp: this.battle.player.hp, maxHp: this.maxHp,
      cargo: Object.freeze({ ...this.cargo }), cargoCapacity: this.cargoCapacity,
      activeSeconds: this.activeSeconds, countdown: Math.ceil(this.countdown),
      pauseReasons: Object.freeze([...this.pause.reasons]) });
  }

  setInput(x: number, y: number): void { this.battle.setInput(x, y); }

  collect(kind: Material, amount: number): number {
    nonnegative(amount);
    if (!(kind in this.cargo)) throw new RangeError('Unknown material');
    if (this.state !== 'Running' || this.pause.paused) return 0;
    const accepted = kind === 'crystal' ? Math.min(amount, this.cargoCapacity - this.cargo.crystal) : amount;
    if (!Number.isFinite(this.cargo[kind] + accepted)) throw new RangeError('Cargo overflow');
    this.cargo[kind] += accepted;
    return accepted;
  }

  advance(seconds: number): void {
    nonnegative(seconds);
    // A paused scene cannot discover a new death from stale external HP.
    if (this.state !== 'Running' || this.pause.paused) {
      if (this.pause.reasons.length === 1 && this.pause.reasons[0] === 'countdown') {
        this.countdown = Math.max(0, this.countdown - seconds);
        if (this.countdown < 1e-9) { this.countdown = 0; this.pause.remove('countdown'); }
      }
      return;
    }
    if (this.battle.player.hp <= 0) { this.die(); return; }
    const total = this.accumulator + seconds;
    const due = Math.floor((total + 1e-10) / STEP_SECONDS);
    if (!Number.isSafeInteger(due)) throw new RangeError('Elapsed time exceeds clock precision');
    this.accumulator = Math.max(0, total - due * STEP_SECONDS);
    const steps = Math.min(due, 3);
    this.battle.stats.droppedSteps += due - steps;
    for (let i = 0; i < steps && this.state === 'Running'; i++) {
      this.battle.step();
      this.activeSeconds += STEP_SECONDS;
      const rate = this.baseRate * (1 + this.depthIncrement * Math.floor(this.depth / 500));
      const drySeconds = Math.max(0, STEP_SECONDS - this.oxygen / rate);
      this.oxygen = Math.max(0, this.oxygen - rate * STEP_SECONDS);
      this.battle.player.hp = Math.max(0, this.battle.player.hp - this.maxHp * 0.02 * drySeconds);
      if (this.battle.player.hp <= 0) this.die();
    }
  }

  hide(): void { this.pause.add('background'); }
  show(): void {
    if (!this.pause.has('background')) return;
    // Insert countdown before removing background, so input never briefly resumes.
    if (this.state === 'Running') { this.countdown = 3; this.pause.add('countdown'); }
    this.pause.remove('background');
  }

  connectionLost(nowMs: number): void {
    nonnegative(nowMs);
    if (this.state !== 'Running' && this.state !== 'RescuePending') return;
    if (this.disconnectedAt === undefined) this.disconnectedAt = nowMs;
    this.pause.add('reconnect');
  }
  connectionRestored(nowMs: number): boolean {
    nonnegative(nowMs); this.checkConnectionTimeout(nowMs);
    this.disconnectedAt = undefined; this.pause.remove('reconnect');
    return this.state === 'Running' || this.state === 'RescuePending';
  }
  checkConnectionTimeout(nowMs: number): void {
    nonnegative(nowMs);
    if (this.disconnectedAt === undefined || nowMs - this.disconnectedAt <= 30_000) return;
    if (this.state === 'RescuePending') this.declineRescue();
    else if (this.state === 'Running') this.beginReturn('disconnect');
    if (this.state === 'Returning') this.arriveHarbor();
  }

  /** Called only after a reward service has authorized this rescue. */
  rescue(): boolean {
    if (this.state !== 'RescuePending' || this.disconnectedAt !== undefined) return false;
    this.battle.player.hp = this.maxHp * 0.5;
    this.currentState = 'Running'; this.frozenDeath = undefined;
    this.syncPause();
    return true;
  }
  declineRescue(): boolean {
    if (this.state !== 'RescuePending') return false;
    this.cargo = { ...this.frozenDeath!.cargo, crystal: 0 };
    this.beginReturn('death');
    return true;
  }
  requestReturn(): boolean {
    if (this.state !== 'Running') return false;
    this.beginReturn('return'); return true;
  }
  arriveHarbor(): boolean {
    if (this.state !== 'Returning') return false;
    this.currentState = 'PendingSettlement';
    this.settlement = Object.freeze({ diveId: this.diveId, reason: this.returnReason,
      cargo: Object.freeze({ ...this.cargo }), activeSeconds: this.activeSeconds, depth: this.depth });
    this.syncPause(); return true;
  }
  /** This acknowledgement does not credit a wallet. The settlement service owns that. */
  confirmSettlement(diveId: string): boolean {
    if (this.state !== 'PendingSettlement' || diveId !== this.diveId) return false;
    this.currentState = 'Settled'; return true;
  }

  private die(): void {
    this.battle.player.hp = 0;
    this.currentState = 'RescuePending';
    this.frozenDeath = this.snapshot;
    this.syncPause();
  }
  private beginReturn(reason: Settlement['reason']): void {
    this.returnReason = reason; this.currentState = 'Returning'; this.syncPause();
  }
  private syncPause(): void {
    this.accumulator = 0;
    this.battle.setPaused(this.pause.paused || this.state !== 'Running');
  }
}
