import { Battle } from './Battle';
import { STEP_SECONDS } from './model';
import type { BattleOptions } from './model';
import { PauseManager } from './PauseManager';
import { DEFAULT_BALANCE, monsterDrop, integer } from '@abyss-hunter/shared';
import type { BattleCheckpoint } from './Battle';

export type DiveState = 'Running' | 'RescuePending' | 'Returning' | 'PendingSettlement' | 'Settled';
export type Material = 'crystal' | 'pearl' | 'marrow' | 'core';
export type Cargo = Readonly<Record<Material, number>>;
export interface DiveOptions {
  diveId: string;
  battle?: Omit<BattleOptions, 'collectLoot' | 'onKill'>;
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
  readonly xp?: number;
}
export interface DiveCheckpoint {
  version: 1; options: Omit<DiveOptions, 'battle'>; state: DiveState; cargo: Record<Material, number>;
  oxygen: number; activeSeconds: number; xp: number; countdown: number; disconnectedAt?: number;
  frozenDeath?: DiveSnapshot; settlement?: Settlement; returnReason: Settlement['reason'];
  deaths: number; refills: number; appliedAdTokens: string[]; pauseReasons: string[]; battle: BattleCheckpoint;
  benefits: { yield: number; oxygen: number; cargo: number };
  dismissedOxygenEventId?: string;
}

function nonnegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid nonnegative number');
}

/** Owns the active clock. No platform clock, wallet, ad or UI dependencies. */
export class DiveSession {
  readonly battle: Battle;
  readonly pause: PauseManager;
  readonly diveId: string;
  private readonly baseOxygenCapacity: number;
  private readonly baseCargoCapacity: number;
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
  private xp = 0;
  private deaths = 0;
  private refills = 0;
  private readonly appliedAdTokens = new Set<string>();
  private benefits = { yield: 1, oxygen: 1, cargo: 1 };
  private sonar = false;
  private dismissedOxygenEventId?: string;
  get oxygenPrompt(): boolean { return this.state === 'Running' && this.oxygen / this.oxygenCapacity < DEFAULT_BALANCE.ads.lowOxygenRatio && this.dismissedOxygenEventId !== this.oxygenEventId; }
  dismissOxygenPrompt(): void { this.dismissedOxygenEventId = this.oxygenEventId; }

  constructor(options: DiveOptions) {
    if (!options.diveId.trim()) throw new RangeError('Missing diveId');
    this.diveId = options.diveId;
    this.baseOxygenCapacity = options.oxygenCapacity ?? 120;
    this.baseCargoCapacity = options.cargoCapacity ?? DEFAULT_BALANCE.attributes.baseValues[4];
    this.maxHp = options.maxHp ?? 200;
    this.baseRate = options.oxygenBaseRate ?? 1;
    this.depthIncrement = options.oxygenDepthIncrement ?? 0.2;
    for (const n of [this.oxygenCapacity, this.cargoCapacity, this.maxHp, this.baseRate]) {
      if (!Number.isFinite(n) || n <= 0) throw new RangeError('Invalid dive capacity/rate');
    }
    nonnegative(this.depthIncrement);
    this.oxygen = this.oxygenCapacity;
    this.battle = new Battle({ ...options.battle, collectLoot: value => this.collect('crystal', value), onKill: enemy => {
      const drop = monsterDrop(enemy.kind, Math.min(this.depth, DEFAULT_BALANCE.drops.maxDepth), [this.battle.randomSample(), this.battle.randomSample()]);
      this.xp += DEFAULT_BALANCE.progression.killXp[enemy.kind];
      for (const kind of ['pearl', 'marrow', 'core'] as const) this.collect(kind, drop[kind]);
      return Math.round(drop.crystal * this.benefits.yield);
    } });
    this.battle.player.hp = this.maxHp;
    this.pause = new PauseManager(() => this.syncPause());
  }

  get state(): DiveState { return this.currentState; }
  get oxygenCapacity(): number { return this.baseOxygenCapacity * this.benefits.oxygen; }
  get cargoCapacity(): number { return Math.floor(this.baseCargoCapacity * this.benefits.cargo); }
  get depth(): number { return Math.max(0, this.battle.player.y); }
  get deathSnapshot(): DiveSnapshot | undefined { return this.frozenDeath; }
  get pendingSettlement(): Settlement | undefined { return this.settlement; }
  get deathEventId(): string { return `${this.diveId}.death.${this.deaths}`; }
  get oxygenEventId(): string { return `${this.diveId}.oxygen.${this.refills}`; }
  hasAdToken(token: string): boolean { return this.appliedAdTokens.has(token); }
  setBenefits(benefits: { yield: number; oxygen: number; cargo: number; sonar?: boolean }): void {
    this.sonar = benefits.sonar === true;
    for (const value of [benefits.yield, benefits.oxygen, benefits.cargo]) if (!Number.isFinite(value) || value < 1 || value > Math.max(...DEFAULT_BALANCE.ads.blessingMultipliers)) throw new RangeError('Invalid benefits');
    const ratio = benefits.oxygen / this.benefits.oxygen;
    this.oxygen = Math.min(this.oxygen * ratio, this.baseOxygenCapacity * benefits.oxygen);
    this.benefits = { yield: benefits.yield, oxygen: benefits.oxygen, cargo: benefits.cargo };
  }
  get snapshot(): DiveSnapshot {
    return Object.freeze({ diveId: this.diveId, state: this.state, depth: this.depth,
      oxygen: this.oxygen, oxygenCapacity: this.oxygenCapacity, hp: this.battle.player.hp, maxHp: this.maxHp,
      cargo: Object.freeze({ ...this.cargo }), cargoCapacity: this.cargoCapacity,
      activeSeconds: this.activeSeconds, countdown: Math.ceil(this.countdown),
      pauseReasons: Object.freeze([...this.pause.reasons]) });
  }

  setInput(x: number, y: number, held = false): void { this.battle.setInput(x, y, held); }

  collect(kind: Material, amount: number): number {
    integer(amount);
    if (!(kind in this.cargo)) throw new RangeError('Unknown material');
    if (this.state !== 'Running' || this.pause.paused) return 0;
    const accepted = kind === 'crystal' ? Math.min(amount, Math.max(0, this.cargoCapacity - this.cargo.crystal)) : amount;
    if (!Number.isSafeInteger(this.cargo[kind] + accepted)) throw new RangeError('Cargo overflow');
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
      this.battle.setSonar(this.sonar, this.oxygen / this.oxygenCapacity < DEFAULT_BALANCE.ads.lowOxygenRatio, this.cargo.crystal < this.cargoCapacity);
      this.battle.step();
      this.activeSeconds += STEP_SECONDS;
      const rate = this.baseRate * (1 + this.depthIncrement * Math.floor(this.depth / 500));
      const drySeconds = Math.max(0, STEP_SECONDS - this.oxygen / rate);
      this.oxygen = Math.max(0, this.oxygen - rate * STEP_SECONDS);
      this.battle.player.hp = Math.max(0, this.battle.player.hp - this.maxHp * 0.02 * drySeconds);
      if (this.battle.player.hp <= 0) this.die();
      else if (this.activeSeconds >= DEFAULT_BALANCE.session.maxActiveSeconds) this.beginReturn('return');
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
  connectionRestored(nowMs: number, rewardPending = false): boolean {
    nonnegative(nowMs); if (!rewardPending) this.checkConnectionTimeout(nowMs);
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
  rescue(token?: string): boolean {
    if (token && this.appliedAdTokens.has(token)) return false;
    if (this.state !== 'RescuePending' || this.disconnectedAt !== undefined) return false;
    this.battle.player.hp = this.maxHp * 0.5;
    this.currentState = 'Running'; this.frozenDeath = undefined;
    if (token) this.appliedAdTokens.add(token);
    this.syncPause();
    return true;
  }
  refillOxygen(token: string): boolean {
    if (!token || this.appliedAdTokens.has(token) || this.state !== 'Running' || this.disconnectedAt !== undefined || this.oxygen / this.oxygenCapacity >= DEFAULT_BALANCE.ads.lowOxygenRatio) return false;
    this.oxygen = this.oxygenCapacity; this.refills++; this.appliedAdTokens.add(token); return true;
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
      cargo: Object.freeze({ ...this.cargo }), activeSeconds: this.activeSeconds, depth: this.depth, xp: this.xp });
    this.syncPause(); return true;
  }
  /** This acknowledgement does not credit a wallet. The settlement service owns that. */
  confirmSettlement(diveId: string): boolean {
    if (this.state !== 'PendingSettlement' || diveId !== this.diveId) return false;
    this.currentState = 'Settled'; return true;
  }

  checkpoint(): DiveCheckpoint {
    return JSON.parse(JSON.stringify({ version: 1, options: { diveId: this.diveId, oxygenCapacity: this.baseOxygenCapacity, cargoCapacity: this.baseCargoCapacity,
      maxHp: this.maxHp, oxygenBaseRate: this.baseRate, oxygenDepthIncrement: this.depthIncrement }, state: this.state, cargo: this.cargo,
      oxygen: this.oxygen, activeSeconds: this.activeSeconds, xp: this.xp, countdown: this.countdown, disconnectedAt: this.disconnectedAt,
      frozenDeath: this.frozenDeath, settlement: this.settlement, returnReason: this.returnReason, deaths: this.deaths, refills: this.refills,
      appliedAdTokens: Array.from(this.appliedAdTokens), pauseReasons: this.pause.reasons, dismissedOxygenEventId: this.dismissedOxygenEventId, benefits: this.benefits, battle: this.battle.checkpoint() }));
  }
  static restore(saved: DiveCheckpoint): DiveSession {
    if (!saved || saved.version !== 1 || !['Running', 'RescuePending', 'Returning', 'PendingSettlement', 'Settled'].includes(saved.state)) throw new RangeError('Invalid dive checkpoint');
    const session = new DiveSession({ ...saved.options, battle: saved.battle.options });
    session.setBenefits(saved.benefits);
    for (const kind of ['crystal', 'pearl', 'marrow', 'core'] as const) integer(saved.cargo[kind]);
    for (const n of [saved.oxygen, saved.activeSeconds, saved.countdown]) nonnegative(n);
    for (const n of [saved.xp, saved.deaths, saved.refills]) integer(n);
    if (saved.oxygen > session.oxygenCapacity || saved.cargo.crystal > session.baseCargoCapacity * Math.max(...DEFAULT_BALANCE.ads.blessingMultipliers) ||
      (saved.state === 'RescuePending' && !saved.frozenDeath) || (['PendingSettlement', 'Settled'].includes(saved.state) && !saved.settlement)) throw new RangeError('Incomplete dive checkpoint');
    session.currentState = saved.state; session.cargo = { ...saved.cargo }; session.oxygen = saved.oxygen;
    session.activeSeconds = saved.activeSeconds; session.xp = saved.xp; session.countdown = 0; session.disconnectedAt = saved.disconnectedAt;
    session.returnReason = saved.returnReason; session.deaths = saved.deaths; session.refills = saved.refills;
    session.dismissedOxygenEventId = saved.dismissedOxygenEventId;
    for (const token of saved.appliedAdTokens) session.appliedAdTokens.add(token);
    session.frozenDeath = saved.frozenDeath ? Object.freeze({ ...saved.frozenDeath, cargo: Object.freeze({ ...saved.frozenDeath.cargo }) }) : undefined;
    session.settlement = saved.settlement ? Object.freeze({ ...saved.settlement, cargo: Object.freeze({ ...saved.settlement.cargo }) }) : undefined;
    session.battle.restore(saved.battle);
    // Fresh foreground always resumes through a countdown; stale ad pauses are reconciled by the reward service.
    for (const reason of saved.pauseReasons) if (reason === 'modal' || reason === 'reconnect') session.pause.add(reason);
    if (session.state === 'Running') { session.hide(); session.show(); }
    session.syncPause(); return session;
  }

  private die(): void {
    this.battle.player.hp = 0;
    this.currentState = 'RescuePending';
    this.deaths++;
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
