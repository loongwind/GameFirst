import { DEFAULT_BALANCE } from '@abyss-hunter/shared';
import type { EconomyService } from './EconomyService';
import type { AdContext, AdSlot, CommandResult } from './model';
import { identifier } from './model';

export type AdState = 'Idle' | 'Loading' | 'Ready' | 'Showing' | 'Completed' | 'Skipped' | 'Failed';
export interface AdDriver {
  readonly isMock: boolean;
  load(): Promise<void>;
  show(): Promise<'completed' | 'skipped' | 'unknown'>;
}
export interface AdHooks {
  onState?: (state: AdState) => void;
  onAdStarted?: () => void;
  onAdClosed?: () => void;
  /** Must be idempotent by token; an interrupted local effect is retried from the durable intent. */
  onReward?: (result: CommandResult, token: string) => void;
}
export interface AdRequest { opId: string; slot: AdSlot; context?: AdContext }
export interface AdOutcome { status: 'completed' | 'skipped' | 'pending'; result?: CommandResult }

/** Driver handles viewing only. All qualification, limits, reservations and rewards use dispatch. */
export class AdService {
  state: AdState = 'Idle';
  private busy = false;
  private pending: { token: string; opId: string; completedInMemory: boolean } | null = null;
  constructor(private readonly economy: EconomyService, readonly driver: AdDriver, private readonly hooks: AdHooks = {}) {
    this.recoverIntent();
  }
  private recoverIntent(): void {
    // A previous cancellation write may have failed. Never cancel an in-memory completed video.
    if (this.pending) return;
    const saved = this.economy.snapshot;
    if (saved.pendingAd) {
      const intent = saved.intents[saved.pendingAd], opId = intent.token.slice(0, -'.prepare.token'.length);
      if (intent.status === 'completed') this.pending = { token: intent.token, opId, completedInMemory: true };
      else this.economy.dispatch({ type: 'ad.cancel', opId: `${opId}.cancel`, token: intent.token });
    }
  }
  async watch(request: AdRequest): Promise<AdOutcome> {
    if (this.busy) throw new Error('AD_BUSY');
    this.recoverIntent();
    if (this.pending) throw new Error('AD_CLAIM_PENDING');
    identifier(request.opId); if (request.opId.length > 100) throw new RangeError('Ad opId too long');
    this.busy = true; let token: string | undefined, started = false;
    try {
      token = this.economy.dispatch({ type: 'ad.prepare', opId: `${request.opId}.prepare`, slot: request.slot, context: request.context }).token!;
      const saved = this.economy.snapshot.intents[token];
      if (saved.status === 'claimed') {
        const result = this.economy.dispatch({ type: 'ad.claim', opId: `${request.opId}.claim`, token });
        this.hooks.onReward?.(result, token); return { status: 'completed', result };
      }
      if (saved.status === 'cancelled') return { status: 'skipped' };
      this.transition('Loading');
      let loaded = false;
      for (let i = 0; i <= DEFAULT_BALANCE.ads.maxRetries; i++) {
        try { await this.driver.load(); loaded = true; break; } catch { /* exactly one configured load retry */ }
      }
      if (!loaded) throw new Error('AD_LOAD_FAILED');
      this.transition('Ready'); this.hooks.onAdStarted?.(); started = true; this.transition('Showing');
      let outcome: Awaited<ReturnType<AdDriver['show']>>;
      try { outcome = await this.driver.show(); }
      catch {
        // A failed show may be retried once. A completed/unknown close is never replayed.
        await this.driver.load(); outcome = await this.driver.show();
      }
      if (outcome !== 'completed') {
        this.economy.dispatch({ type: 'ad.cancel', opId: `${request.opId}.cancel`, token });
        this.transition('Skipped'); return { status: 'skipped' };
      }
      this.pending = { token, opId: request.opId, completedInMemory: true };
      try { return this.claim(); } catch { return { status: 'pending' }; }
    } catch (error) {
      if (token && !this.pending) this.economy.dispatch({ type: 'ad.cancel', opId: `${request.opId}.cancel`, token });
      this.transition('Failed'); throw error;
    } finally {
      this.busy = false;
      if (!this.pending) { if (started) this.hooks.onAdClosed?.(); this.transition('Idle'); }
    }
  }
  /** No video playback; retain the original token/opIds after storage or confirmation failures. */
  async retryClaim(): Promise<AdOutcome> {
    if (this.busy) throw new Error('AD_BUSY');
    if (!this.pending) return { status: 'completed' };
    this.busy = true;
    try {
      const result = this.claim(); this.hooks.onAdClosed?.(); this.transition('Idle'); return result;
    } catch (error) {
      if (error instanceof Error && /AD_NOT_COMPLETED_OR_EXPIRED|AD_EXPIRED/.test(error.message)) {
        const pending = this.pending!;
        this.economy.dispatch({ type: 'ad.cancel', opId: `${pending.opId}.cancel`, token: pending.token });
        this.pending = null; this.transition('Failed'); this.hooks.onAdClosed?.(); this.transition('Idle'); throw error;
      }
      return { status: 'pending' };
    }
    finally { this.busy = false; }
  }
  private claim(): AdOutcome {
    const pending = this.pending!;
    if (pending.completedInMemory) this.economy.dispatch({ type: 'ad.complete', opId: `${pending.opId}.complete`, token: pending.token });
    const result = this.economy.dispatch({ type: 'ad.claim', opId: `${pending.opId}.claim`, token: pending.token });
    this.hooks.onReward?.(result, pending.token);
    this.pending = null; this.transition('Completed'); return { status: 'completed', result };
  }
  private transition(state: AdState): void { this.state = state; this.hooks.onState?.(state); }
}
