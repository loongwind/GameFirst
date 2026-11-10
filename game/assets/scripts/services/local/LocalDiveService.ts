import { DEFAULT_BALANCE } from '@abyss-hunter/shared';
import { DiveSession } from '../../battle/DiveSession';
import type { DiveOptions, DiveCheckpoint } from '../../battle/DiveSession';
import type { EconomyService } from './EconomyService';
import type { AdSlot, AdContext } from './model';

interface SavedDive { savedAt: number; startedAt: number; session: DiveCheckpoint }
/** Checkpoint before payout. Payout receipt before acknowledgement. Each crash boundary is replayable. */
export class LocalDiveService {
  private startedAt = 0;
  constructor(private readonly economy: EconomyService, private readonly now: () => number = Date.now) {}
  open(diveId: string, options: Omit<DiveOptions, 'diveId'> = {}): DiveSession {
    const saved = this.economy.snapshot.activeDive as SavedDive | null;
    if (saved && saved.session.state !== 'Settled') {
      const session = DiveSession.restore(saved.session); this.startedAt = saved.startedAt;
      // Reconcile completed/claimed ads before timeout finalization can destroy the original choice.
      return session;
    }
    const session = new DiveSession({ ...options, diveId }); this.startedAt = this.now(); this.save(session);
    this.economy.dispatch({ type: 'telemetry.record', opId: `start:${diveId}`, name: 'dive_start', properties: { sea_layer: 0, cargo_free: session.cargoCapacity, oxygen_max: session.oxygenCapacity, power: 20 } });
    return session;
  }
  save(session: DiveSession): void {
    this.economy.checkpoint({ savedAt: this.now(), startedAt: this.startedAt, session: session.checkpoint() } satisfies SavedDive);
  }
  /** Called only after the platform confirms connectivity, including a fresh already-online page. */
  restoreConnection(session: DiveSession, videoInProgress = false): boolean {
    const unresolvedReward = Object.values(this.economy.snapshot.intents).some(intent => intent.diveId === session.diveId &&
      (intent.status === 'completed' || intent.status === 'claimed' && !session.hasAdToken(intent.token)));
    return session.connectionRestored(this.now(), videoInProgress || unresolvedReward);
  }
  reconcileAds(session: DiveSession): void {
    const pending = this.economy.snapshot.pendingAd;
    if (pending) {
      const intent = this.economy.snapshot.intents[pending];
      if (intent.status === 'completed' && this.now() <= intent.claimUntil) {
        const originalOpId = pending.slice(0, -'.prepare.token'.length);
        this.economy.dispatch({ type: 'ad.claim', opId: `${originalOpId}.claim`, token: pending });
      } else this.economy.dispatch({ type: 'ad.cancel', opId: `cancel:${pending}`, token: pending });
    }
    for (const intent of Object.values(this.economy.snapshot.intents)) {
      if (intent.diveId === session.diveId && intent.status === 'claimed') this.applyAdReward(session, intent.token);
    }
    session.pause.remove('ad');
    if (this.now() - this.startedAt > DEFAULT_BALANCE.session.resumeWindowMs) {
      if (session.state === 'RescuePending') session.declineRescue();
      else if (session.state === 'Running') session.requestReturn();
    }
    if (session.state === 'Returning') session.arriveHarbor();
    session.checkConnectionTimeout(this.now()); this.save(session);
  }
  settle(session: DiveSession): boolean {
    if (session.state !== 'PendingSettlement') return false;
    this.save(session);
    this.economy.dispatch({ type: 'dive.settle', opId: `settle:${session.diveId}`, settlement: session.pendingSettlement! });
    // If this write fails, payout is still durable, and the original pending checkpoint replays the receipt.
    session.confirmSettlement(session.diveId); this.save(session); return true;
  }
  adEligible(session: DiveSession, slot: AdSlot, context: AdContext): boolean {
    if (context.diveId !== session.diveId || session.pause.has('reconnect')) return false;
    if (slot === 'rescue') return session.state === 'RescuePending' && context.eventId === session.deathEventId;
    if (slot === 'oxygen') return session.state === 'Running' && context.eventId === session.oxygenEventId && session.snapshot.oxygen / session.oxygenCapacity < DEFAULT_BALANCE.ads.lowOxygenRatio;
    return true;
  }
  applyAdReward(session: DiveSession, token: string): void {
    const intent = this.economy.snapshot.intents[token];
    if (!intent || intent.status !== 'claimed' || !['rescue', 'oxygen'].includes(intent.slot)) return;
    if (intent.diveId !== session.diveId) throw new Error('AD_EFFECT_DIVE_MISMATCH');
    if (session.hasAdToken(token)) { this.save(session); return; }
    const applied = intent.slot === 'rescue' ? session.rescue(token) : session.refillOxygen(token);
    if (!applied) throw new Error('AD_EFFECT_PENDING'); this.save(session);
  }
}
