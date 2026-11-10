import { _decorator, Component, EventKeyboard, EventTouch, Game, game, input, Input, KeyCode, Node, UITransform, Vec3 } from 'cc';
import { WECHAT } from 'cc/env';
import { DiveSession } from '../battle/DiveSession';
import { joystickVector } from '../battle/input';
import { createPlatformAdapter } from '../platform/createPlatformAdapter';
import type { PlatformAdapter, Unsubscribe } from '../platform/PlatformAdapter';
import { DiveHud } from '../ui/DiveHud';
import type { HudAction } from '../ui/DiveHud';
import { DEFAULT_BALANCE, attributeValue } from '@abyss-hunter/shared';
import { EconomyService } from './local/EconomyService';
import { LocalSaveService } from './local/SaveService';
import { LocalDiveService } from './local/LocalDiveService';
import { AdService } from './local/AdService';
import type { AdDriver } from './local/AdService';

const { ccclass } = _decorator;

@ccclass('DiveController')
export class DiveController extends Component {
  session!: DiveSession;
  hud!: DiveHud;
  economy!: EconomyService;
  dives!: LocalDiveService;
  private platform!: PlatformAdapter;
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly keys = new Set<number>();
  private pointer: number | undefined;
  private stick = { x: 0, y: 0 };
  private notice = '';
  private freshFrame = true;
  private savedState = '';
  private nextSaveAt = 0;
  private nextSettlementAttempt = 0;
  private needsAdRecovery = false;

  onLoad(): void {
    this.platform = createPlatformAdapter(WECHAT ? 'wechat' : 'browser');
    this.economy = new EconomyService(new LocalSaveService(this.platform.storage), {
      adEligible: (slot, context) => this.dives.adEligible(this.session, slot, context),
    });
    this.dives = new LocalDiveService(this.economy);
    const state = this.economy.snapshot, attrs = state.attributes;
    this.session = this.dives.open(`dive-${Date.now()}-${Math.random().toString(36).slice(2)}`, {
      maxHp: attributeValue('hp', attrs.hp), cargoCapacity: Math.floor(attributeValue('cargo', attrs.cargo)),
      oxygenCapacity: DEFAULT_BALANCE.attributes.baseValues[5], oxygenBaseRate: 1 / (1 + DEFAULT_BALANCE.attributes.gainPerLevel[5] * attrs.oxygen),
    });
    if (this.economy.saveStatus === 'recovered') this.notice = '已恢复上一份有效存档。';
    try { this.dives.reconcileAds(this.session); }
    catch { this.needsAdRecovery = true; this.session.pause.add('ad'); this.notice = '奖励确认中，请勿重复观看。'; }
    this.hud = new DiveHud(this.node, action => this.handleAction(action));
    this.subscriptions.push(this.platform.onHide(this.onHide), this.platform.onShow(this.onShow));
    game.on(Game.EVENT_HIDE, this.onHide); game.on(Game.EVENT_SHOW, this.onShow);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this); input.on(Input.EventType.KEY_UP, this.keyUp, this);
    this.node.on(Node.EventType.TOUCH_START, this.touchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.touchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
    if (!WECHAT) {
      window.addEventListener('blur', this.onHide); window.addEventListener('focus', this.onBrowserFocus);
      window.addEventListener('offline', this.onConnectionLost); window.addEventListener('online', this.onConnectionRestored);
      if (!navigator.onLine) this.onConnectionLost();
    }
    this.update(0);
  }

  update(seconds: number): void {
    this.session.setBenefits(this.economy.activeBenefits());
    const size = this.node.getComponent(UITransform)!.contentSize, device = this.platform.getDeviceInfo();
    const ratio = size.width / device.windowWidth;
    this.hud.resize(size.width, size.height, {
      top: device.safeArea.top * ratio,
      bottom: Math.max(0, device.windowHeight - device.safeArea.top - device.safeArea.height) * ratio,
      left: device.safeArea.left * ratio,
      right: Math.max(0, device.windowWidth - device.safeArea.left - device.safeArea.width) * ratio,
    });
    if (this.needsAdRecovery && Date.now() >= this.nextSettlementAttempt) {
      this.nextSettlementAttempt = Date.now() + 1000;
      try { this.dives.reconcileAds(this.session); this.needsAdRecovery = false; this.notice = ''; }
      catch { /* Keep the same reward and paused session retryable. */ }
    }
    if (!this.needsAdRecovery) this.session.checkConnectionTimeout(Date.now());
    if (this.session.pause.paused || this.session.state !== 'Running') this.clearInput();
    else {
      const x = Number(this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT)) - Number(this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT));
      const y = Number(this.keys.has(KeyCode.KEY_S) || this.keys.has(KeyCode.ARROW_DOWN)) - Number(this.keys.has(KeyCode.KEY_W) || this.keys.has(KeyCode.ARROW_UP));
      this.session.setInput(this.pointer === undefined ? x : this.stick.x, this.pointer === undefined ? y : this.stick.y);
    }
    // Lifecycle gaps are wall time, never active time or foreground countdown.
    this.session.advance(this.freshFrame ? 0 : seconds);
    this.freshFrame = false;
    if (this.session.state === 'Returning') this.session.arriveHarbor();
    if (!this.needsAdRecovery && this.session.state === 'PendingSettlement' && Date.now() >= this.nextSettlementAttempt) {
      this.nextSettlementAttempt = Date.now() + 1000;
      try { this.dives.settle(this.session); this.notice = ''; }
      catch { this.notice = '存档未确认，收获保持冻结，正在重试保存。'; }
    }
    if (this.savedState !== this.session.state || Date.now() >= this.nextSaveAt) this.saveProgress();
    this.hud.render(this.session, this.notice);
  }

  // Service integration points: a real ad/reward service owns authorization and payout.
  onAdStarted(): void { this.clearInput(); this.session.pause.add('ad'); }
  onAdClosed(): void { this.freshFrame = true; this.session.pause.remove('ad'); }
  onRescueAuthorized(token: string): boolean {
    const intent = this.economy.snapshot.intents[token];
    if (!intent || intent.slot !== 'rescue' || intent.status !== 'claimed' || this.session.hasAdToken(token)) return false;
    this.dives.applyAdReward(this.session, token); this.freshFrame = true; this.notice = ''; return true;
  }
  createAdService(driver: AdDriver): AdService {
    return new AdService(this.economy, driver, { onAdStarted: () => this.onAdStarted(), onAdClosed: () => this.onAdClosed(),
      onReward: (_result, token) => { this.dives.applyAdReward(this.session, token); this.freshFrame = true; } });
  }
  readonly onConnectionLost = (): void => { this.clearInput(); this.session.connectionLost(Date.now()); };
  readonly onConnectionRestored = (): void => { this.freshFrame = true; this.session.connectionRestored(Date.now()); };

  onDestroy(): void {
    if (this.dives && this.session) this.saveProgress();
    this.subscriptions.forEach(off => off());
    game.off(Game.EVENT_HIDE, this.onHide); game.off(Game.EVENT_SHOW, this.onShow);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this); input.off(Input.EventType.KEY_UP, this.keyUp, this);
    this.node.off(Node.EventType.TOUCH_START, this.touchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.touchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
    if (!WECHAT) {
      window.removeEventListener('blur', this.onHide); window.removeEventListener('focus', this.onBrowserFocus);
      window.removeEventListener('offline', this.onConnectionLost); window.removeEventListener('online', this.onConnectionRestored);
    }
    this.platform?.dispose(); this.session?.battle.dispose(); this.hud?.destroy();
  }

  private readonly onHide = (): void => { this.clearInput(); this.session.hide(); this.saveProgress(); };
  private readonly onShow = (): void => { this.freshFrame = true; this.session.checkConnectionTimeout(Date.now()); this.session.show(); };
  private readonly onBrowserFocus = (): void => { if (!document.hidden) this.onShow(); };
  private clearInput(): void {
    this.keys.clear(); this.pointer = undefined; this.stick = { x: 0, y: 0 }; this.session?.setInput(0, 0);
  }
  private saveProgress(): void {
    this.nextSaveAt = Date.now() + 15_000;
    try {
      if (this.session.state === 'RescuePending') this.economy.dispatch({ type: 'telemetry.record', opId: `death:${this.session.deathEventId}`,
        name: 'death_occurred', properties: { depth_band: Math.floor(this.session.depth / DEFAULT_BALANCE.drops.depthBand), cargo_lost: 0, rescued: false } });
      this.dives.save(this.session); this.savedState = this.session.state;
    } catch { this.notice = '本地保存失败，请保留页面并检查存储空间。'; }
  }
  private keyDown(event: EventKeyboard): void {
    if (this.session.state === 'Running' && !this.session.pause.paused) this.keys.add(event.keyCode);
  }
  private keyUp(event: EventKeyboard): void { this.keys.delete(event.keyCode); }
  private touchPoint(event: EventTouch): { x: number; y: number } {
    const p = event.getUILocation();
    const local = this.hud.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return { x: local.x + 187.5, y: this.hud.layout.height / 2 - local.y };
  }
  private touchStart(event: EventTouch): void {
    if (this.session.state !== 'Running' || this.session.pause.paused || this.pointer !== undefined) return;
    const p = this.touchPoint(event), r = this.hud.layout.joystick;
    if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height) return;
    this.pointer = event.getID() ?? undefined; this.touchMove(event);
  }
  private touchMove(event: EventTouch): void {
    if (event.getID() !== this.pointer) return;
    const p = this.touchPoint(event), r = this.hud.layout.joystick;
    this.stick = joystickVector(p.x - r.x - r.width / 2, p.y - r.y - r.height / 2, 50);
  }
  private touchEnd(event: EventTouch): void { if (event.getID() === this.pointer) this.clearInput(); }

  private handleAction(action: HudAction): void {
    const s = this.session;
    if (s.pause.has('ad') || s.pause.has('background') || s.pause.has('reconnect')) return;
    if (action === 'pause' && s.state === 'Running' && !s.pause.paused) { this.clearInput(); s.pause.add('modal'); }
    else if (action === 'return' && s.state === 'Running' && !s.pause.paused) s.requestReturn();
    else if (action === 'primary') {
      if (s.state === 'RescuePending' && !s.pause.paused) {
        this.notice = '救援服务待接入，舱内收获保持冻结。\n可等待救援或放弃返航。';
        this.node.emit('rescue-request', s.deathSnapshot);
      } else if (s.state === 'Running' && s.pause.has('modal')) s.pause.remove('modal');
    } else if (action === 'secondary') {
      if (s.state === 'RescuePending' && !s.pause.paused) s.declineRescue();
      else if (s.state === 'Running' && s.pause.has('modal')) { s.pause.remove('modal'); s.requestReturn(); }
    }
  }
}
