import { BlockInputEvents, Button, Color, Graphics, Label, Layers, Node, UITransform } from 'cc';
import type { DiveSession } from '../battle/DiveSession';
import { hudLayout } from './hudLayout';
import type { HudInsets, HudLayout, HudRect } from './hudLayout';
import type { DiveAdView } from '../services/local/DiveAdModel';

const ink = new Color(7, 25, 35), panel = new Color(15, 43, 54), line = new Color(43, 82, 90);
const mint = new Color(105, 233, 198), cream = new Color(233, 240, 218), muted = new Color(126, 165, 169);
const amber = new Color(255, 189, 99), danger = new Color(255, 110, 111);

export type HudAction = 'pause' | 'return' | 'primary' | 'secondary' | 'sonar' | 'oxygen' | 'dismissOxygen';

/** Cocos presentation only: reads a session, emits commands through callbacks. */
export class DiveHud {
  readonly root: Node;
  layout!: HudLayout;
  private world!: Graphics;
  private chrome!: Graphics;
  private modalGraphics!: Graphics;
  private overlay!: Node;
  private oxygenCard!: Node;
  private readonly labels = new Map<string, Label>();
  private readonly buttons = new Map<HudAction, Button>();
  private width = 0;
  private height = 0;
  private insetsKey = '';

  constructor(parent: Node, private readonly action: (action: HudAction) => void) {
    this.root = this.node('DiveHUD', parent);
  }

  resize(width: number, height: number, insets: HudInsets): void {
    const key = JSON.stringify(insets);
    if (this.width === width && this.height === height && this.insetsKey === key) return;
    this.width = width; this.height = height; this.insetsKey = key;
    for (const child of [...this.root.children]) child.destroy();
    this.root.removeAllChildren(); this.labels.clear(); this.buttons.clear();
    const l = this.layout = hudLayout(width, height, insets);
    this.root.setScale(l.scale, l.scale, 1);
    this.root.getComponent(UITransform)!.setContentSize(375, l.height);
    this.world = this.node('Ocean', this.root).addComponent(Graphics);
    this.chrome = this.node('Instruments', this.root).addComponent(Graphics);
    this.label('title', '潜 渊 猎 手', l.left + 18, l.top + 14, 190, 24, 19, cream);
    this.label('run', 'DIVE / 01', l.left + 18, l.top + 40, 120, 18, 10, muted);
    this.label('hp', '', 160, l.top + 39, 151, 18, 11, mint);
    this.label('oxygenGauge', '', l.oxygen.x + 12, l.oxygen.y + 6, l.oxygen.width - 24, 22, 13, cream);
    this.label('cargo', '', l.cargo.x + 12, l.cargo.y + 3, l.cargo.width - 24, 20, 12, cream);
    this.label('status', '', l.status.x + 4, l.status.y + 2, l.status.width - 8, 28, 12, amber);
    this.label('depth', '', 258 - l.right, l.top + 176, 91, 22, 15, mint);
    this.label('layer', '透光层', l.left + 20, l.joystick.y - 44, 220, 20, 11, muted);
    this.label('hint', '向下探索 · 留意氧气与舱容', l.left + 20, l.joystick.y - 25, 280, 20, 11, muted);
    this.label('feedback', '', l.left + 20, l.joystick.y - 84, 285, 38, 12, amber);
    for (let d = 0; d <= 2000; d += 500) this.label(`mark-${d}`, String(d), 300 - l.right, l.rail.y + d / 2400 * l.rail.height - 5, 35, 18, 9, muted);
    this.button('pause', l.pause, '暂停', this.root);
    this.button('return', l.return, '安全返航 ↑', this.root);
    this.button('sonar', l.sonar, '', this.root);
    this.oxygenCard = this.node('OxygenCard', this.root);
    const cardGraphics = this.oxygenCard.addComponent(Graphics);
    this.box(cardGraphics, l.oxygenCard, panel, 12);
    this.box(cardGraphics, l.oxygenAd, new Color(32, 83, 80), 8);
    this.box(cardGraphics, l.oxygenDismiss, ink, 8);
    this.label('oxygenTitle', '应急供氧', l.oxygenCard.x + 12, l.oxygenCard.y + 10, 265, 23, 17, cream, this.oxygenCard);
    this.label('oxygenBody', '', l.oxygenCard.x + 12, l.oxygenCard.y + 38, 265, 34, 12, muted, this.oxygenCard);
    this.button('oxygen', l.oxygenAd, '观看 · 氧气回满', this.oxygenCard);
    this.button('dismissOxygen', l.oxygenDismiss, '坚持上浮 · 关闭', this.oxygenCard);
    this.label('stick', '下 潜', l.joystick.x + 24, l.joystick.y + 46, 80, 20, 11, muted);
    this.overlay = this.node('DiveOverlay', this.root);
    this.overlay.getComponent(UITransform)!.setContentSize(375, l.height);
    this.overlay.addComponent(BlockInputEvents);
    this.modalGraphics = this.overlay.addComponent(Graphics);
    this.label('modalTitle', '', l.modal.x + 20, l.modal.y + 19, l.modal.width - 40, 32, 22, cream, this.overlay);
    this.label('modalBody', '', l.modal.x + 20, l.modal.y + 61, l.modal.width - 40, 90, 13, muted, this.overlay);
    this.button('primary', l.primary, '', this.overlay);
    this.button('secondary', l.secondary, '', this.overlay);
    this.overlay.active = false;
  }

  render(session: DiveSession, notice = '', ads?: DiveAdView): void {
    const s = session.snapshot, l = this.layout, g = this.chrome;
    this.drawWorld(session);
    g.clear();
    this.box(g, l.oxygen, panel, 9); this.box(g, l.cargo, panel, 7);
    const oxygenColor = s.oxygen / s.oxygenCapacity < 0.15 ? danger : mint;
    this.box(g, { x: l.oxygen.x + 12, y: l.oxygen.y + 29, width: l.oxygen.width - 24, height: 4 }, line, 2);
    this.box(g, { x: l.oxygen.x + 12, y: l.oxygen.y + 29, width: (l.oxygen.width - 24) * s.oxygen / s.oxygenCapacity, height: 4 }, oxygenColor, 2);
    this.box(g, { x: l.cargo.x, y: l.cargo.y + l.cargo.height - 3, width: l.cargo.width * Math.min(1, s.cargo.crystal / s.cargoCapacity), height: 3 }, amber, 0);
    this.set('oxygenGauge', `O₂  氧气储量                         ${Math.ceil(s.oxygen / s.oxygenCapacity * 100)}%`);
    this.set('cargo', `收集舱   ${Math.floor(s.cargo.crystal)} / ${s.cargoCapacity} 荧晶`);
    this.set('hp', `生命  ${Math.ceil(s.hp)} / ${s.maxHp}`);
    this.set('depth', `${Math.floor(s.depth)} m ↓`);
    this.set('layer', s.depth < 800 ? '01 / 透光层' : s.depth < 1600 ? '02 / 暮光层' : '03 / 深渊层');
    this.set('status', s.oxygen <= 0 ? '氧气耗尽 · 正在失去生命，请尽快返航' : s.oxygen / s.oxygenCapacity < 0.15 ? '低氧警报 · 仍可行动，建议立即返航' : s.cargo.crystal >= s.cargoCapacity ? '收集舱已满 · 更多荧晶将留在海底' : '氧耗随深度上升 · 返航保住收获');
    for (const r of [l.pause, l.return, l.sonar]) this.box(g, r, panel, 10);
    const seconds = ads?.sonarSeconds ?? 0;
    this.set('sonar', seconds ? `声呐 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${session.battle.movementMode === 'manual' ? '手动接管' : seconds <= 60 ? '可刷新' : '自动移动'}` : '声呐协击 · 观看开启15分钟');
    this.buttons.get('sonar')!.interactable = s.state === 'Running' && !session.pause.paused && !!ads?.sonarRefreshable;
    this.oxygenCard.active = !!ads?.oxygenPrompt && s.state === 'Running' && !session.pause.paused;
    this.set('oxygenBody', `观看后立即回满 · 今日剩余 ${ads?.oxygenRemaining ?? 0}/3\n可关闭提示，摇杆与返航始终可用。`);
    this.buttons.get('oxygen')!.interactable = (ads?.oxygenRemaining ?? 0) > 0;
    this.set('feedback', s.state === 'Running' && !session.pause.paused ? notice : '');
    g.strokeColor = line; g.lineWidth = 1;
    g.moveTo(l.rail.x - 187.5, l.height / 2 - l.rail.y); g.lineTo(l.rail.x - 187.5, l.height / 2 - l.rail.y - l.rail.height); g.stroke();
    for (let d = 0; d <= 2400; d += 100) {
      const y = l.height / 2 - l.rail.y - d / 2400 * l.rail.height;
      g.moveTo(l.rail.x - 187.5, y); g.lineTo(l.rail.x - 187.5 + (d % 500 === 0 ? 13 : 5), y); g.stroke();
    }
    this.dot(g, l.rail.x, l.rail.y + Math.min(1, s.depth / 2400) * l.rail.height, 4, mint);
    const cx = l.joystick.x + 56, cy = l.joystick.y + 56;
    g.strokeColor = line; g.lineWidth = 2; g.circle(cx - 187.5, l.height / 2 - cy, 54); g.stroke();
    g.circle(cx - 187.5, l.height / 2 - cy, 32); g.stroke();
    this.dot(g, cx, cy - 22, 3, mint);
    this.drawModal(session, notice, ads);
  }

  destroy(): void { this.root.destroy(); }

  private drawModal(session: DiveSession, notice: string, ads?: DiveAdView): void {
    const s = session.snapshot, l = this.layout;
    this.overlay.active = s.state !== 'Running' || session.pause.paused;
    if (!this.overlay.active) return;
    const g = this.modalGraphics; g.clear();
    this.box(g, { x: 0, y: 0, width: 375, height: l.height }, new Color(2, 13, 21, 215), 0);
    this.box(g, l.modal, panel, 16);
    this.box(g, { x: l.modal.x + 20, y: l.modal.y + 7, width: 36, height: 3 }, mint, 1);
    let title = '潜航已暂停', body = '战斗与氧气已冻结。\n准备好后继续探索。', primary = '继续潜航', secondary = '安全返航';
    if (s.state === 'RescuePending') {
      title = '等待救援';
      body = notice || `舱内 ${Math.floor(s.cargo.crystal)} 荧晶已冻结。\n救援成功保留收获；放弃仅损失荧晶。\n珍珠、深海髓与渊核均保留。`;
      primary = `观看 · 救援浮标 (${ads?.rescueRemaining ?? 3}/3)`; secondary = '放弃救援 · 返航';
    } else if (s.state === 'PendingSettlement' || s.state === 'Settled') {
      title = s.state === 'Settled' ? '结算已确认' : '已返航 · 待结算';
      body = notice || `荧晶 ${Math.floor(s.cargo.crystal)}    珍珠 ${s.cargo.pearl}\n深海髓 ${s.cargo.marrow}    渊核 ${s.cargo.core}\n${s.state === 'Settled' ? '收获已入账，进度已保存。' : '货物已冻结，等待保存确认。'}`;
      primary = s.state === 'Settled' ? '返回母港' : '货物安全保留'; secondary = s.state === 'Settled' ? '' : '等待保存确认';
    } else if (s.state === 'Returning') { title = '正在返航'; body = '正在冻结本局收获…'; primary = '返航中'; secondary = ''; }
    else if (session.pause.has('background')) { title = '已冻结现场'; body = '回到前台后倒计时恢复。'; primary = '等待回到前台'; secondary = ''; }
    else if (session.pause.has('ad')) { title = '等待补给'; body = '战斗与氧气已冻结。'; primary = '等待广告结束'; secondary = ''; }
    else if (session.pause.has('reconnect')) { title = '连接中断'; body = '战斗、氧气与舱内收获均已冻结。\n30 秒内重连将恢复原现场；\n超时自动返航并保留待结算摘要。'; primary = '等待连接恢复'; secondary = ''; }
    else if (session.pause.has('countdown') && !session.pause.has('modal')) {
      title = String(s.countdown); body = '即将恢复潜航\n氧气与怪物仍然冻结。'; primary = '准备下潜'; secondary = '';
    }
    if (ads?.rewardPending) { title = '奖励确认中'; body = notice || '现场保持冻结，重试原奖励即可。\n无需再次观看视频。'; primary = '重试原奖励'; secondary = ''; }
    else if (ads?.busy) { title = '等待补给'; body = notice || '战斗与氧耗已冻结。'; primary = '正在加载或播放…'; secondary = ''; }
    this.set('modalTitle', title); this.set('modalBody', body); this.set('primary', primary); this.set('secondary', secondary);
    this.box(g, l.primary, new Color(32, 83, 80), 9);
    if (secondary) this.box(g, l.secondary, ink, 9);
    this.labels.get('secondary')!.node.active = !!secondary;
    const blocked = session.pause.has('ad') || session.pause.has('background') || session.pause.has('reconnect');
    const actionable = !blocked && (s.state === 'Settled' || s.state === 'RescuePending' || (s.state === 'Running' && session.pause.has('modal')));
    this.buttons.get('primary')!.interactable = ads?.rewardPending ? !ads.busy && !session.pause.has('background') && !session.pause.has('reconnect') : actionable && !(s.state === 'RescuePending' && (ads?.rescueRemaining ?? 3) === 0);
    this.buttons.get('secondary')!.interactable = actionable && !!secondary && !ads?.rewardPending;
  }

  private drawWorld(session: DiveSession): void {
    const g = this.world, l = this.layout, b = session.battle; g.clear();
    this.box(g, { x: 0, y: 0, width: 375, height: l.height }, ink, 0);
    const cy = Math.max(300, l.height * 0.48);
    g.strokeColor = new Color(16, 47, 59); g.lineWidth = 1;
    for (let y = 190 - b.player.y % 60; y < l.height - 160; y += 60) {
      g.moveTo(-187.5, l.height / 2 - y); g.lineTo(187.5, l.height / 2 - y); g.stroke();
    }
    const point = (item: { x: number; y: number }) => ({ x: 180 + item.x - b.player.x, y: cy + item.y - b.player.y });
    for (const zone of b.dangerZones) { const p = point(zone); this.dot(g, p.x, p.y, zone.radius, new Color(90, 43, 56, 120)); }
    for (const o of b.obstacles) { const p = point(o); this.dot(g, p.x, p.y, o.radius, new Color(34, 62, 72)); }
    for (const e of b.enemies.values()) { const p = point(e); this.dot(g, p.x, p.y, e.radius, new Color(194, 93, 125)); }
    for (const e of b.loot.values()) { const p = point(e); this.dot(g, p.x, p.y, 3, mint); }
    for (const e of b.projectiles.values()) {
      const p = point(e);
      if (e.kind === 'torpedo') this.dot(g, p.x, p.y, 3, cream);
      else { g.strokeColor = e.kind === 'mine' ? amber : mint; g.circle(p.x - 187.5, l.height / 2 - p.y, e.radius); g.stroke(); }
    }
    for (const e of b.effects.values()) {
      const p = point(e), end = point({ x: e.endX, y: e.endY }); g.strokeColor = mint;
      g.moveTo(p.x - 187.5, l.height / 2 - p.y); g.lineTo(end.x - 187.5, l.height / 2 - end.y); g.stroke();
    }
    g.strokeColor = new Color(45, 101, 106); g.lineWidth = 1;
    for (const radius of [42, 70]) { g.circle(-7.5, l.height / 2 - cy, radius); g.stroke(); }
    this.dot(g, 180, cy, 12, mint); this.dot(g, 180, cy - 3, 7, cream);
  }

  private node(name: string, parent: Node): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.addComponent(UITransform); return n;
  }
  private label(name: string, text: string, x: number, y: number, width: number, height: number, size: number, color: Color, parent = this.root): void {
    const n = this.node(name, parent); n.setPosition(x - 187.5, this.layout.height / 2 - y);
    n.getComponent(UITransform)!.setAnchorPoint(0, 1); n.getComponent(UITransform)!.setContentSize(width, height);
    const label = n.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size + 5;
    label.color = color; label.horizontalAlign = Label.HorizontalAlign.LEFT; label.verticalAlign = Label.VerticalAlign.TOP;
    label.overflow = Label.Overflow.CLAMP; label.enableWrapText = true;
    this.labels.set(name, label);
  }
  private button(name: HudAction, r: HudRect, text: string, parent: Node): void {
    const n = this.node(`${name}-touch`, parent);
    n.setPosition(r.x + r.width / 2 - 187.5, this.layout.height / 2 - r.y - r.height / 2);
    n.getComponent(UITransform)!.setContentSize(r.width, r.height);
    const button = n.addComponent(Button); button.transition = Button.Transition.NONE;
    this.buttons.set(name, button);
    n.on(Button.EventType.CLICK, () => this.action(name));
    // Label coordinates are root-relative; the touch node remains its own hit box.
    this.label(name, text, r.x + 8, r.y + 15, r.width - 16, 25, 13, cream, parent);
  }
  private set(name: string, value: string): void {
    const label = this.labels.get(name)!;
    if (label.string !== value) label.string = value;
  }
  private box(g: Graphics, r: HudRect, color: Color, radius: number): void {
    if (r.width <= 0 || r.height <= 0) return;
    g.fillColor = color;
    if (radius) g.roundRect(r.x - 187.5, this.layout.height / 2 - r.y - r.height, r.width, r.height, Math.min(radius, r.width / 2));
    else g.rect(r.x - 187.5, this.layout.height / 2 - r.y - r.height, r.width, r.height);
    g.fill();
  }
  private dot(g: Graphics, x: number, y: number, radius: number, color: Color): void {
    g.fillColor = color; g.circle(x - 187.5, this.layout.height / 2 - y, radius); g.fill();
  }
}
