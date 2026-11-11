import { DEFAULT_BALANCE, upgradeCost, attributeValue, synthesize } from '@abyss-hunter/shared';
import type { Equipment } from '@abyss-hunter/shared';
import type { Action, LocalState, CommandResult, AdSlot, AdContext } from '../services/local/model';
import type { AdOutcome, AdRequest } from '../services/local/AdService';
import { businessDay } from '../services/local/EconomyService';
import { objectiveTasks } from '../services/local/Objectives';

export type Phase = 'loading' | 'empty' | 'error' | 'normal';
export type HarborCommand = Action extends infer A ? A extends Action ? Omit<A, 'opId'> : never : never;
interface EconomyPort { readonly snapshot: LocalState; dispatch(action: Action): CommandResult | Promise<CommandResult> }
interface AdsPort { watch(request: AdRequest): Promise<AdOutcome>; retryClaim(): Promise<AdOutcome> }
export const ATTRIBUTE_NAMES: Record<string, string> = { hp: '耐压装甲', attack: '攻击力', attackSpeed: '攻击速度', moveSpeed: '移动速度', cargo: '收集舱容量', oxygen: '氧气效率' };
export const TREE_NAMES: Record<string, string> = { attack: '攻击', survival: '生存', oxygen: '氧气', cargo: '舱容', special: '特殊' };
export const EQUIPMENT_NAMES: Record<string, string> = { sonic: '声波炮', torpedo: '鱼雷巢', arc: '电弧链', mine: '诱饵浮雷', light: '探照灯', fin: '潜流鳍', armor: '装甲片', magnet: '磁吸器' };
export const QUALITY_NAMES = ['残破', '标准', '精良', '史诗', '传说'];
export function message(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  const known: Record<string, string> = { INSUFFICIENT_FUNDS: '余额不足，先下潜收集并卸货。', LEVEL_LOCKED: '等级尚未开放。', INVENTORY_FULL: '收纳舱已满，先合成装备。', AD_LOAD_FAILED: '视频加载失败，请稍后重试。', AD_DRIVER_UNAVAILABLE: '广告服务暂未就绪，请稍后再试。', AD_DAILY_LIMIT: '今日次数已用完。', SONAR_ACTIVE: '协击仍在生效，到期前一分钟可续期。', PREREQUISITE: '请先解锁前置节点。', INSUFFICIENT_TICKETS: '升级券不足。', ACTIVE_DIVE: '请先返回潜航现场并完成卸货。' };
  return known[code] ?? '操作未确认，请重试原操作；已确认资产会保留。';
}
/** Presentation only: previews reuse shared algorithms; every mutation goes through the port. */
export class HarborModel {
  phase: Phase = 'normal'; notice = ''; busy = false;
  private listeners = new Set<() => void>();
  private pending: Action | undefined;
  private adPending = false;
  private dead = false;
  private sequence = 0;
  private readonly prefix = `harbor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  constructor(readonly economy: EconomyPort, private ads?: AdsPort, private readonly now = Date.now) {
    this.adPending = !!economy.snapshot.pendingAd;
    if (this.adPending) { this.phase = 'error'; this.notice = '有一笔补给奖励待确认，请重试领取。'; }
  }
  get snapshot(): LocalState { return this.economy.snapshot; }
  get listenerCount(): number { return this.listeners.size; }
  get rewardPending(): boolean { return this.adPending; }
  get hasPending(): boolean { return !!this.pending || this.adPending; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  setAds(ads: AdsPort): void { this.ads = ads; }
  private emit(): void { if (!this.dead) this.listeners.forEach(fn => fn()); }
  dispose(): void { this.dead = true; this.listeners.clear(); }
  attributes() {
    const s = this.snapshot;
    return DEFAULT_BALANCE.attributes.ids.map(id => {
      const level = s.attributes[id], maxed = level >= DEFAULT_BALANCE.attributes.maxLevel;
      return { id, title: ATTRIBUTE_NAMES[id], level, value: attributeValue(id, level), next: attributeValue(id, maxed ? level : level + 1), maxed,
        cost: { crystal: maxed ? '0' : upgradeCost(level), core: !maxed && (level + 1) % DEFAULT_BALANCE.attributes.coreMilestone === 0 ? String(DEFAULT_BALANCE.attributes.coreCost) : '0' } };
    });
  }
  tech(tree: string) {
    const unlocked = this.snapshot.tech;
    return DEFAULT_BALANCE.tech.nodes.filter(n => n.tree === tree).map(n => ({ ...n, learned: unlocked.includes(n.id), enabled: !unlocked.includes(n.id) && n.requires.every(id => unlocked.includes(id)) }));
  }
  synthesis(items: readonly Equipment[], mainId: string) {
    if (!mainId) throw new Error('Explicit main equipment required');
    return synthesize(items, mainId, 'preview');
  }
  adRemaining(slot: AdSlot): number {
    const s = this.snapshot;
    if (s.playerLevel < DEFAULT_BALANCE.ads.unlockLevel || (slot === 'silver' || slot === 'gold') && s.playerLevel < DEFAULT_BALANCE.equipment.unlockLevel) return 0;
    return Math.max(0, DEFAULT_BALANCE.ads.slots[slot] - (s.daily[businessDay(this.now())]?.[slot] ?? 0));
  }
  /** Only earned, unclaimed task rewards create a dot. */
  redDots(): string[] { return objectiveTasks(this.snapshot).some(t => t.ready) ? ['tasks'] : []; }
  buffSeconds(kind: 'blessing' | 'sonar'): number {
    const s = this.snapshot, expiresAt = kind === 'sonar' ? s.buffs.sonarUntil : s.buffs.blessing?.expiresAt ?? 0;
    return Math.max(0, Math.ceil((expiresAt - this.now()) / 1000));
  }
  async execute(command: HarborCommand): Promise<void> {
    if (this.busy) throw new Error('BUSY');
    if (this.pending || this.adPending && command.type !== 'equipment.synthesize') { this.notice = '请先重试待确认操作。'; this.emit(); return; }
    if (this.snapshot.activeDive) { this.phase = 'error'; this.notice = message(new Error('ACTIVE_DIVE')); this.emit(); return; }
    if (command.type === 'box.draw' && this.snapshot.inventory.length + command.count > DEFAULT_BALANCE.equipment.inventoryLimit) {
      this.phase = 'error'; this.notice = '收纳舱空间不足，请先合成装备腾出位置。'; this.emit(); return;
    }
    this.pending = { ...command, opId: `${this.prefix}-${++this.sequence}` } as Action;
    await this.runPending();
  }
  async retry(): Promise<void> {
    if (this.busy) return;
    if (this.pending) { await this.runPending(); return; }
    if (this.adPending) { await this.runAd(); return; }
    this.phase = 'normal'; this.notice = ''; this.emit();
  }
  private async runPending(): Promise<void> {
    this.busy = true; this.phase = 'loading'; this.notice = '正在确认操作…'; this.emit();
    try {
      const result = await this.economy.dispatch(this.pending!);
      this.pending = undefined; this.phase = this.adPending ? 'error' : 'normal';
      this.notice = this.adPending ? '装备已合成，请返回补给重试原奖励，无需再次观看。' : result.itemIds ? `已入库 ${result.itemIds.length} 件装备，余额已确认。` : '操作已确认，进度已保存。';
    } catch (error) {
      // Definite validation rejections did not commit. Ambiguous storage/network failures retain opId.
      if (error instanceof Error && /^(INSUFFICIENT_FUNDS|LEVEL_LOCKED|INVENTORY_FULL|PREREQUISITE|INVALID_TECH|INSUFFICIENT_TICKETS|ITEM_NOT_FOUND|INVALID_SLOT|TASK_INELIGIBLE|ACTIVE_DIVE)$/.test(error.message)) this.pending = undefined;
      this.phase = 'error'; this.notice = message(error);
    }
    finally { this.busy = false; this.emit(); }
  }
  async watch(slot: AdSlot, context?: AdContext): Promise<void> {
    if (this.busy) return;
    if (this.hasPending) { this.notice = '奖励待确认，请重试领取，无需再次观看。'; this.emit(); return; }
    if (this.snapshot.activeDive) { this.phase = 'error'; this.notice = message(new Error('ACTIVE_DIVE')); this.emit(); return; }
    if ((slot === 'silver' || slot === 'gold') && this.snapshot.inventory.length >= DEFAULT_BALANCE.equipment.inventoryLimit) {
      this.phase = 'error'; this.notice = '收纳舱已满，请先合成装备再观看视频。'; this.emit(); return;
    }
    await this.runAd({ opId: `${this.prefix}-ad-${++this.sequence}`, slot, context });
  }
  private async runAd(request?: AdRequest): Promise<void> {
    this.busy = true; this.phase = 'loading'; this.notice = request ? '正在加载补给视频…' : '正在确认原奖励…'; this.emit();
    try {
      if (!this.ads) throw new Error('AD_DRIVER_UNAVAILABLE');
      const result = request ? await this.ads.watch(request) : await this.ads.retryClaim();
      this.adPending = result.status === 'pending'; this.phase = this.adPending ? 'error' : 'normal';
      this.notice = this.adPending ? '奖励待确认，请重试领取，无需再次观看。' : result.status === 'skipped' ? '未完整观看，本次不发放奖励。' : '补给已确认。';
    } catch (error) { this.phase = 'error'; this.notice = message(error); }
    finally { this.busy = false; this.emit(); }
  }
}
