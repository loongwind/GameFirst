import { DEFAULT_BALANCE } from '@abyss-hunter/shared';
import type { DiveSession } from '../../battle/DiveSession';
import { AdService } from './AdService';
import type { AdDriver, AdOutcome } from './AdService';
import type { EconomyService } from './EconomyService';
import { businessDay } from './EconomyService';
import type { LocalDiveService } from './LocalDiveService';
import type { AdSlot } from './model';

export interface DiveAdView {
  oxygenPrompt: boolean; oxygenRemaining: number; rescueRemaining: number;
  sonarSeconds: number; sonarRefreshable: boolean; busy: boolean; rewardPending: boolean;
}
const unavailable: AdDriver = { isMock: false, async load() { throw new Error('AD_DRIVER_UNAVAILABLE'); }, async show() { throw new Error('AD_DRIVER_UNAVAILABLE'); } };

/** UI orchestration only. Qualification, counters and payouts stay in the P1-04 services. */
export class DiveAdModel {
  notice = '';
  private busy = false;
  private rewardPending = false;
  private service?: AdService;
  private driver: AdDriver = unavailable;
  private sequence = 0;
  private readonly prefix = `dive-ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  constructor(private readonly economy: EconomyService, private readonly dives: LocalDiveService, private readonly session: DiveSession,
    private readonly now: () => number = Date.now, private readonly lifecycle: { started?: () => void; closed?: () => void } = {}) {}

  configure(driver?: AdDriver): void {
    if (this.busy || this.rewardPending) throw new Error('AD_BUSY');
    this.driver = driver ?? unavailable; this.service = undefined;
  }
  get view(): DiveAdView {
    const state = this.economy.snapshot, used = state.daily[businessDay(this.now())] ?? {};
    const seconds = Math.max(0, Math.ceil((state.buffs.sonarUntil - this.now()) / 1000));
    return { oxygenPrompt: this.session.oxygenPrompt, oxygenRemaining: Math.max(0, DEFAULT_BALANCE.ads.slots.oxygen - (used.oxygen ?? 0)),
      rescueRemaining: Math.max(0, DEFAULT_BALANCE.ads.slots.rescue - (used.rescue ?? 0)), sonarSeconds: seconds,
      sonarRefreshable: state.playerLevel >= DEFAULT_BALANCE.ads.unlockLevel && state.buffs.sonarUntil - this.now() <= DEFAULT_BALANCE.ads.sonarRenewWindowMs && (used.sonar ?? 0) < DEFAULT_BALANCE.ads.slots.sonar,
      busy: this.busy, rewardPending: this.rewardPending };
  }
  dismissOxygen(): void { this.session.dismissOxygenPrompt(); this.notice = ''; }
  async watch(slot: 'sonar' | 'rescue' | 'oxygen'): Promise<void> {
    if (this.busy) return;
    if (this.rewardPending) { await this.retry(); return; }
    if (this.session.pause.paused || !['Running', 'RescuePending'].includes(this.session.state)) return;
    await this.run(slot);
  }
  async retry(): Promise<void> { if (!this.busy && this.rewardPending) await this.run(); }
  private async run(slot?: AdSlot): Promise<void> {
    this.busy = true; this.notice = slot ? '正在加载视频…' : '正在确认原奖励，无需再次观看。';
    this.session.pause.add('ad'); this.lifecycle.started?.();
    try {
      // Persist the original death/oxygen event before a video can complete or the app can hide.
      this.dives.save(this.session);
      this.service ??= new AdService(this.economy, this.driver, { onReward: (_result, token) => this.dives.applyAdReward(this.session, token) });
      const context = slot === 'rescue' || slot === 'oxygen' ? { diveId: this.session.diveId, eventId: slot === 'rescue' ? this.session.deathEventId : this.session.oxygenEventId } : undefined;
      const result: AdOutcome = slot ? await this.service.watch({ opId: `${this.prefix}-${++this.sequence}`, slot, context }) : await this.service.retryClaim();
      this.rewardPending = result.status === 'pending';
      this.notice = this.rewardPending ? '奖励确认中，请重试领取，无需再次观看。' : result.status === 'skipped' ? '未完整观看，本次不发奖。可继续原选择。' : '补给已确认。';
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'AD_CLAIM_PENDING') this.rewardPending = true;
      const messages: Record<string, string> = { AD_LOAD_FAILED: '视频加载失败，请稍后重试或继续潜航。', AD_DRIVER_UNAVAILABLE: '视频服务暂未就绪，可继续潜航或放弃救援。', AD_DAILY_LIMIT: '今日次数已用完，可继续潜航或放弃救援。', LEVEL_LOCKED: '声呐尚未开放，基础自动攻击始终可用。', SONAR_ACTIVE: '声呐仍在生效，剩余一分钟可刷新。', AD_INELIGIBLE: '本次情境已变化，请继续当前潜航。', AD_NOT_COMPLETED_OR_EXPIRED: '奖励确认窗口已过期，可继续原选择。', AD_EXPIRED: '奖励确认窗口已过期，可继续原选择。' };
      if (/AD_NOT_COMPLETED_OR_EXPIRED|AD_EXPIRED/.test(code)) this.rewardPending = false;
      this.notice = messages[code] ?? (this.rewardPending ? '奖励确认中，请重试原奖励，无需再次观看。' : '操作保存失败，请检查存储后重试。');
    } finally {
      this.busy = false;
      if (!this.rewardPending) { this.session.pause.remove('ad'); this.lifecycle.closed?.(); }
    }
  }
}
