import { Node, UITransform, SpriteFrame, BitmapFont, Widget, BlockInputEvents, Label, Color, Graphics, Mask, ScrollView, UIOpacity } from 'cc';
import { DEFAULT_BALANCE, equipmentUpgradeCost } from '@abyss-hunter/shared';
import type { Equipment } from '@abyss-hunter/shared';
import { HarborModel, TREE_NAMES, EQUIPMENT_NAMES, QUALITY_NAMES, CURRENCY_NAMES } from '../meta/HarborModel';
import type { HarborCommand } from '../meta/HarborModel';
import { attributePreview, comparisonLine, equipComparison, itemDetail, itemKeyStats, slotReadout, sourceLines, summaryLines } from '../meta/loadoutStats';
import { harborLayout } from './harborLayout';
import type { HarborInsets, Rect } from './harborLayout';
import { UiScope, VirtualRows, C } from './HarborKit';
import { objectiveTasks, tutorialHint } from '../services/local/Objectives';
import { depthPosterView } from './DepthPosterView';
import type { PosterPort } from './DepthPosterView';
export type Panel = 'upgrade' | 'tech' | 'equipment' | 'supply' | 'archive' | 'tasks' | 'poster';
const TITLES: Record<Panel, string> = { upgrade: '机体强化', tech: '潜航科技', equipment: '挂载装备', supply: '远航补给', archive: '探索档案', tasks: '潜航目标', poster: '新的深度纪录' };
const EQUIP_ICON: Record<string, string> = { light: 'equip_searchlight' };
const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
/** Scene-native UI. Base navigation survives overlay close; each overlay has its own subscription scope. */
export class HarborView {
  readonly root: Node;
  layout = harborLayout(375, 812);
  panel?: Panel;
  private base?: UiScope;
  private overlay?: UiScope;
  private toast?: UiScope;
  private offBase?: () => void;
  private panelDirty = false;
  private tree = 'attack';
  private mainId = '';
  private auxiliary: string[] = [];
  private slot = 0;
  private focusedId = '';
  private mergeConfirm = false;
  private compactSynthesis = false;
  private supplyFocus = 0;
  private signature = '';
  private lists: VirtualRows[] = [];
  private timers: Label[] = [];
  private shownRecord = 0;
  private panelOpenedAt = 0;
  constructor(private readonly parent: Node, readonly model: HarborModel, private readonly frames: ReadonlyMap<string, SpriteFrame>, private readonly font: BitmapFont | undefined,
    private readonly launch: () => void, private readonly posterPort?: PosterPort) {
    this.root = new Node('HarborRoot'); this.root.layer = parent.layer; parent.addChild(this.root); this.root.addComponent(UITransform).setAnchorPoint(0, 1);
    this.offBase = model.subscribe(() => {
      this.panelDirty = true;
      // Dismissal must free input this frame; waiting for the next update() would swallow a fast follow-up tap.
      if (!model.rewardToast && this.toast) { this.toast.dispose(); this.toast = undefined; }
    });
  }
  get liveRows(): number { return this.lists.reduce((sum, list) => sum + list.liveRows, 0); }
  resize(width: number, height: number, insets: HarborInsets, viewport = { width, height }): void {
    const l = harborLayout(width, height, insets, viewport), key = JSON.stringify(l);
    if (key === this.signature) return;
    this.signature = key; this.layout = l;
    this.root.setScale(l.scale, l.scale, 1); this.root.setPosition(-width / 2, height / 2);
    this.root.getComponent(UITransform)!.setContentSize(375, l.height);
    this.buildBase(); this.drawPanel();
  }
  update(): void {
    if (this.panelDirty) { this.panelDirty = false; this.buildBase(); this.drawPanel(); }
    if (this.overlay) this.animateOverlay();
    for (const i of [0, 1]) {
      const label = this.timers[i]; if (!label) continue;
      const seconds = this.model.buffSeconds(i === 0 ? 'blessing' : 'sonar');
      label.string = seconds ? `生效中 ${Math.floor(seconds / 60)}分${seconds % 60}秒` : '当前未激活';
    }
    if (this.timers[2] || this.timers[3]) {
      const offer = this.model.giftPreview();
      if (this.timers[2]) this.timers[2].string = `当前馈赠：${CURRENCY_NAMES[offer.currency] ?? offer.currency} ×${offer.amount}`;
      if (this.timers[3]) this.timers[3].string = `${offer.refreshIn}秒后刷新 · 完整观看后入账`;
    }
    if (this.model.rewardToast && !this.toast) this.drawToast(this.model.rewardToast);
    else if (!this.model.rewardToast && this.toast) { this.toast.dispose(); this.toast = undefined; }
    const p = this.model.snapshot.objectives;
    if (!this.panel && !this.model.hasPending && p.record && p.record.depth > Math.max(p.posterSeen, this.shownRecord)) {
      this.shownRecord = p.record.depth; this.open('poster');
    }
  }
  open(panel: Panel, supplyFocus = 0): void { this.supplyFocus = supplyFocus; this.panel = panel; this.mergeConfirm = false; this.compactSynthesis=false; this.drawPanel(); }
  close(): void {
    const depth = this.panel === 'poster' ? this.model.snapshot.objectives.record?.depth : undefined;
    this.overlay?.dispose(); this.overlay = undefined; this.lists = []; this.timers = []; this.panel = undefined;
    if (depth) void this.model.execute({ type: 'poster.dismiss', depth });
  }
  destroy(): void { this.close(); this.toast?.dispose(); this.toast = undefined; this.offBase?.(); this.base?.dispose(); this.root.destroy(); }
  /** Modal reward confirmation above every panel; the model owns its lifetime, the view only mirrors it. */
  private drawToast(toast: { title: string; body: string; positive: boolean }): void {
    const s = this.toast = this.scope('RewardToast'), l = this.layout;
    s.root.getComponent(UITransform)!.setContentSize(375, l.height);
    s.root.addComponent(BlockInputEvents);
    s.box('ToastScrim', r(0, 0, 375, l.height), undefined, new Color(2, 13, 21, 165));
    const width = 288, height = 190, x = Math.round((375 - width) / 2), y = Math.round(l.height / 2 - height / 2);
    s.box('ToastCard', r(x, y, width, height));
    s.skin('ToastRibbon', 'loo70_ui_ribbon', r(x + 34, y + 10, width - 68, 44));
    s.text('ToastTitle', toast.title, x, y + 24, width, 30, 20, toast.positive ? C.mint : C.amber);
    const label = s.text('ToastBody', toast.body, x + 18, y + 64, width - 36, 56, 14, C.text);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    s.button('toast-confirm', r(x + 52, y + height - 60, width - 104, 44), '收下了', () => this.model.dismissToast(), true, undefined, true);
  }
  private scope(name: string): UiScope {
    const n = new Node(name); n.layer = this.parent.layer; this.root.addChild(n); n.addComponent(UITransform).setAnchorPoint(0, 1);
    return new UiScope(n, this.frames, this.font, this.layout.touch);
  }
  private buildBase(): void {
    this.base?.dispose(); const s = this.base = this.scope('HarborCanvas'), l = this.layout, state = this.model.snapshot;
    // Foreground and submersible retain original aspect ratio.
    s.icon('bg_harbor_far', 0, 0, 375, l.height);
    s.icon('deco_harbor_left', 0, l.height * 0.29, 86, 344);
    s.icon('deco_harbor_right', 289, l.height * 0.29, 86, 344);
    const shade=s.node('HarborShade',s.root,0,0,375,l.height).addComponent(Graphics);
    shade.fillColor=new Color(2,20,34,85);shade.rect(0,-l.height,375,l.height);shade.fill();
    s.box('TitlePlate', r(l.left, l.top, 375 - l.left - l.right, 48));
    s.text('HarborTitle', '潮汐母港', l.left + 14, l.top + 1, 170, 29, 24);
    s.text('HarborSubtitle', 'PORT 01  /  潜渊猎手', l.left + 15, l.top + 30, 200, 13, 9, C.amber);
    s.text('PlayerLevel', `执照 Lv.${state.playerLevel}`, 258-l.right, l.top + 9, 100, 28, 12, C.amber);
    const wallet = s.box('Wallet', r(l.left, l.top + 54, 375 - l.left - l.right, 36));
    const currencies = ['crystal', 'pearl', 'marrow', 'core'] as const;
    currencies.forEach((currency, i) => {
      const x = 6 + i * (375 - l.left - l.right - 12) / 4;
      s.icon(`icon_${currency === 'core' ? 'core_cyan' : currency}`, x, 7, 22, 22, wallet);
      const raw = state.wallet[currency], group = raw.length >= 9 ? 8 : raw.length >= 6 ? 4 : 0;
      const whole = group ? raw.slice(0, -group) : raw;
      const number = group && whole.length < 3 && raw[raw.length - group] !== '0' ? `${whole}.${raw[raw.length - group]}` : whole;
      s.text(`wallet-${currency}`, number, x + 25, 5, group ? 34 : 52, 26, 12, currency === 'pearl' ? C.amber : C.text, wallet, true);
      if (group) s.text(`wallet-${currency}-unit`, group === 8 ? '亿' : '万', x + 59, 10, 16, 22, 10, C.muted, wallet);
    });
    const chart = s.node('NavigationChart',s.root,0,0,375,l.height).addComponent(Graphics);
    const cx=187.5,cy=-(l.heroY+l.heroSize/2),radius=l.heroSize*.53;
    chart.strokeColor=new Color(180,243,221,85);chart.lineWidth=1;
    chart.circle(cx,cy,radius);chart.stroke();chart.circle(cx,cy,radius+7);chart.stroke();
    for(let i=0;i<32;i++){const a=i*Math.PI/16;chart.moveTo(cx+Math.cos(a)*(radius+7),cy+Math.sin(a)*(radius+7));chart.lineTo(cx+Math.cos(a)*(radius+(i%4?10:16)),cy+Math.sin(a)*(radius+(i%4?10:16)));}chart.stroke();
    s.text('Readiness', 'H-01  /  潮汐号', l.left+4, l.top+95, 220, 23, 12, C.text);
    s.text('DiveRoute', state.activeDive?'现场待续':'航线  透光层', 254-l.right, l.top+95, 106, 23, 11, C.amber);
    s.icon('hero_h01_harbor', (375-l.heroSize)/2, l.heroY, l.heroSize, l.heroSize);
    // R2: three scene-native stations with their own pedestals, plus supply, archive and a
    // standalone launch button. No shared bottom bar and no equal-width icon row (LOO-70 §4).
    const dots = this.redDots();
    this.station(s, 'upgrade', l.targets.upgrade as Rect, l.targets.upgrade as Rect, 'icon_upgrade', '机体强化', dots.upgrade);
    this.station(s, 'equipment', l.targets.equipment as Rect, l.targets.equipment as Rect, 'icon_equipment', '挂载装备', dots.equipment);
    this.station(s, 'tech', l.targets.tech as Rect, l.targets.tech as Rect, 'icon_tech', '潜航科技', dots.tech);
    const supply = s.button('supply', l.targets.supply as Rect, '', () => this.open('supply'));
    s.icon('icon_supply', 17, 8, 30, 30, supply);
    const supplyLabel = s.text('supply-title', '深海补给', 0, 40, 64, 18, 10, C.text, supply);
    supplyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    supplyLabel.enableOutline = true; supplyLabel.outlineColor = C.ink; supplyLabel.outlineWidth = 1.5;
    s.text('supply-count', dots.supply > 0 ? String(dots.supply) : '', 44, 2, 18, 18, 11, C.amber, supply);
    const archive=s.button('archive',l.targets.archive as Rect,'',()=>this.open('archive'));
    s.icon('icon_archive',17,8,30,30,archive);
    const archiveLabel = s.text('ArchiveLabel','探索档案',0,40,64,18,10,C.text,archive);
    archiveLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    archiveLabel.enableOutline = true; archiveLabel.outlineColor = C.ink; archiveLabel.outlineWidth = 1.5;
    const hint = tutorialHint(state);
    if (hint) {
      // Guidance belongs to the next action; it never covers the ship or adds another launch.
      s.text('TutorialHint', state.objectives.tutorial.rewarded&&!state.objectives.tutorial.upgraded?'下一步  强化舱容 / 氧效 ↓':state.objectives.tutorial.upgraded?'准备就绪 · 再次出发':'首潜教学 · 拖动游动，自动攻击', l.left+5, (l.targets.upgrade as Rect).y - 28, 375-l.left-l.right-10, 22, 11, C.amber);
    }
    const task = objectiveTasks(state).find(t => t.ready);
    if (task) s.text('TaskReadyHint', '任务已完成 · 进入档案领取奖励', l.left+5, (l.targets.upgrade as Rect).y - 48, 375-l.left-l.right-10, 20, 10, C.mint);
    s.button('LaunchButton', l.targets.launch as Rect, state.activeDive ? '继续潜航 ↓' : '出发下潜 ↓', () => { if (!this.model.busy && !this.model.hasPending) this.launch(); }, !this.model.busy && !this.model.hasPending, undefined, true);
    if (this.overlay) this.overlay.root.setSiblingIndex(this.root.children.length - 1);
    if (this.toast) this.toast.root.setSiblingIndex(this.root.children.length - 1);
  }

  /** A scene station: fixed code geometry (never nine-slice stretched) matching the R2
   *  board — device silhouette in the lower area, icon on the device, full-name riveted
   *  plate along the device body, optional 12px indicator light (LOO-70 §4 R2). */
  private station(s: UiScope, name: string, rect: Rect, _hit: Rect, iconKey: string, title: string, dot: boolean): void {
    const n = s.hit(name, rect, () => this.open(name as Panel));
    const g = s.node(`${name}-device`, n, 0, 0, rect.width, rect.height).addComponent(Graphics);
    const w = rect.width, h = rect.height;
    if (name === 'upgrade') {
      // Graphics local space is y-up from the hit node's top-left anchor, so everything
      // below the anchor draws with negative y. Desk surface at 62% height.
      const deskY = -Math.round(h * .62);
      g.fillColor = new Color(62, 50, 38);
      for (const x of [12, w - 18]) { g.rect(x, deskY + 8, 6, h - deskY - 12 + 8); g.fill(); }
      g.fillColor = new Color(88, 70, 52); g.rect(4, deskY - 10, w - 8, 10); g.fill();
      g.fillColor = new Color(120, 96, 66); g.rect(4, deskY - 3, w - 8, 3); g.fill();
      g.strokeColor = new Color(40, 52, 56); g.lineWidth = 1; g.rect(4, deskY - 10, w - 8, 10); g.stroke();
      g.fillColor = new Color(196, 110, 46); g.rect(w * .66, deskY + 2, 16, 8); g.fill(); g.rect(w * .68, deskY + 8, 5, 7); g.fill();
      g.strokeColor = new Color(150, 168, 170); g.lineWidth = 3.5;
      g.moveTo(w * .3, deskY - 10); g.lineTo(w * .16, deskY + 18); g.stroke();
      g.fillColor = new Color(105, 233, 198); g.circle(w * .15, deskY + 21, 3); g.fill();
      // The upgrade icon rests on the desk surface, vise on its right, torch on its left.
      s.icon(iconKey, Math.round(w * .5 - 17), Math.round(-deskY - 36), 34, 34, n);
      this.plate(s, `${name}-plate`, n, w * .5, -deskY + 24, Math.min(108, w - 6), title);
      if (dot) this.light(s, `${name}-dot`, n, w - 20, Math.round(-deskY - 34));
    } else if (name === 'equipment') {
      // Stout mast with cross-bracing, diagonal boom and the crate hanging from the hook.
      g.fillColor = new Color(46, 70, 76); g.rect(w * .1, -h + 4, w * .8, 10); g.fill();
      g.fillColor = new Color(74, 96, 102); g.rect(w * .6, -h + 10, 14, h - 10); g.fill();
      g.strokeColor = new Color(40, 52, 56); g.lineWidth = 1; g.rect(w * .6, -h + 10, 14, h - 10); g.stroke();
      g.fillColor = new Color(96, 122, 128); g.rect(w * .6, -h * .7, 14, 5); g.fill(); g.rect(w * .6, -h * .38, 14, 5); g.fill();
      g.strokeColor = new Color(88, 70, 52); g.lineWidth = 7;
      g.moveTo(w * .67, -h + 12); g.lineTo(w * .26, -h * .58); g.stroke();
      g.strokeColor = new Color(120, 146, 150); g.lineWidth = 2.5;
      g.moveTo(w * .26, -h * .58); g.lineTo(w * .26, -h * .42); g.stroke();
      s.icon(iconKey, Math.round(w * .26 - 16), Math.round(h * .42), 32, 32, n);
      this.plate(s, `${name}-plate`, n, w * .45, h - 22, Math.min(104, w - 6), title);
      if (dot) this.light(s, `${name}-dot`, n, Math.round(w * .67) + 9, 16);
    } else {
      // Round glass sonar dish on a short pedestal with a stub antenna; plate below the rim.
      const dishY = -Math.round(h * .5);
      g.fillColor = new Color(30, 50, 58); g.rect(w * .32, dishY - 16, w * .36, h - dishY - 16); g.fill();
      g.fillColor = new Color(22, 42, 50); g.rect(w * .28, dishY - 16, w * .44, 6); g.fill();
      g.fillColor = new Color(16, 52, 64); g.ellipse(w * .5, dishY, w * .42, 17); g.fill();
      g.strokeColor = new Color(105, 233, 198, 170); g.lineWidth = 1.5; g.ellipse(w * .5, dishY, w * .35, 13); g.stroke();
      g.fillColor = new Color(105, 233, 198, 120); g.ellipse(w * .5, dishY, w * .12, 4); g.fill();
      g.strokeColor = new Color(150, 168, 170); g.lineWidth = 2; g.moveTo(w * .5, dishY + 15); g.lineTo(w * .66, dishY + 42); g.stroke();
      g.fillColor = new Color(244, 198, 122); g.circle(w * .67, dishY + 45, 3); g.fill();
      this.plate(s, `${name}-plate`, n, w * .5, -dishY + 30, Math.min(104, w - 6), title);
      if (dot) this.light(s, `${name}-dot`, n, Math.round(w * .84), -dishY - 6);
    }
  }

  /** Riveted nameplate on the device body: dark plate, edge line, full Chinese name. */
  private plate(s: UiScope, name: string, parent: Node, cx: number, cy: number, width: number, title: string): void {
    const g = s.node(`${name}-bg`, parent, 0, 0, 0, 0).addComponent(Graphics);
    const x = cx - width / 2, y = cy - 9;
    g.fillColor = new Color(6, 24, 32, 235); g.roundRect(x, -y - 18, width, 18, 4); g.fill();
    g.strokeColor = new Color(163, 107, 53, 220); g.lineWidth = 1; g.roundRect(x, -y - 18, width, 18, 4); g.stroke();
    g.fillColor = new Color(163, 107, 53, 200); g.circle(x + 4, -y - 9, 1.4); g.fill(); g.circle(x + width - 4, -y - 9, 1.4); g.fill();
    const label = s.text(name, title, x + 2, y + 9, width - 4, 16, 12, C.text, parent);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.enableOutline = true; label.outlineColor = C.ink; label.outlineWidth = 1.5;
  }

  /** 12px indicator light with a dark bezel so it reads on any backdrop. */
  private light(s: UiScope, name: string, parent: Node, x: number, y: number): void {
    const light = s.node(name, parent, x, y, 12, 12).addComponent(Graphics);
    light.fillColor = new Color(20, 30, 32); light.circle(6, -6, 7); light.fill();
    light.fillColor = new Color(255, 138, 92); light.circle(6, -6, 5.5); light.fill();
    light.fillColor = new Color(255, 200, 170, 220); light.circle(4.6, -7.4, 1.8); light.fill();
  }

  /** Affordance lights only when the action is genuinely available (LOO-70 §4). */
  private redDots(): { upgrade: boolean; tech: boolean; equipment: boolean; supply: number } {
    const snapshot = this.model.snapshot;
    const crystal = BigInt(snapshot.wallet.crystal), core = BigInt(snapshot.wallet.core), marrow = BigInt(snapshot.wallet.marrow);
    const upgrade = this.model.attributes().some(a => !a.maxed && crystal >= BigInt(a.cost.crystal) && core >= BigInt(a.cost.core));
    const tech = DEFAULT_BALANCE.tech.trees.some(tree => this.model.tech(tree).some(n => n.enabled && crystal >= BigInt(n.crystal) && core >= BigInt(n.core)));
    const unlocked = snapshot.playerLevel >= DEFAULT_BALANCE.equipment.unlockLevel;
    const equipment = unlocked && snapshot.inventory.some(item => item.level < DEFAULT_BALANCE.equipment.maxLevels[item.quality] && marrow > BigInt(0));
    const supply = (['gift', 'blessing', 'sonar', 'silver', 'gold'] as const).reduce((sum, slot) => sum + Math.max(0, this.model.adRemaining(slot)), 0);
    return { upgrade, tech, equipment, supply };
  }
  private drawPanel(): void {
    this.overlay?.dispose(); this.overlay = undefined; this.lists = []; this.timers = [];
    if (!this.panel) return;
    const s = this.overlay = this.scope('OverlayRoot'), l = this.layout, p = l.panel;
    s.root.getComponent(UITransform)!.setContentSize(375, l.height); s.root.addComponent(BlockInputEvents);
    s.box('Scrim', r(0, 0, 375, l.height), undefined, new Color(2, 13, 21, 228));
    const panel = s.box(`${TITLES[this.panel]}Panel`, p), widget = panel.addComponent(Widget);
    widget.target = s.root; widget.isAlignLeft = true; widget.isAlignTop = true; widget.left = p.x; widget.top = p.y; widget.updateAlignment();
    // Rebase panel-local helpers under a panel-owned scope; cleanup remains attached to overlay.
    const header = new UiScope(panel, this.frames, this.font, l.touch);
    s.own(()=>header.dispose());
    // Copper wing-plate behind every panel title (LOO-70 §4 ribbon skin); kept to the title
    // width so the wing tips stay decorative rather than framing the whole panel.
    header.skin('PanelRibbon', 'loo70_ui_ribbon', r(44, 4, Math.min(212, p.width - 150), 44));
    const code:Record<Panel,string>={upgrade:'01 / HULL',tech:'02 / RESEARCH',equipment:'03 / LOADOUT',supply:'04 / SUPPLY',tasks:'05 / ORDERS',archive:'06 / LOGBOOK',poster:'07 / RECORD'};
    const iconKey:Record<Panel,string>={upgrade:'upgrade',tech:'tech',equipment:'equipment',supply:'supply',tasks:'archive',archive:'archive',poster:'archive'};
    header.icon(`icon_${iconKey[this.panel]}`,12,12,32);
    const panelTitle = header.text('PanelTitle', TITLES[this.panel], 52, 6, p.width - 115, 32, 22);
    panelTitle.isBold = true; panelTitle.enableOutline = true; panelTitle.outlineColor = C.ink; panelTitle.outlineWidth = 2;
    header.text('PanelCode', code[this.panel], 54, 35, p.width-125, 16, 9, C.amber);
    header.button('close', r(p.width - 64, 8, 52, l.touch), '关闭', () => this.close());
    const state = this.model.snapshot;
    header.text('PanelBalance', `荧晶 ${state.wallet.crystal} · 珍珠 ${state.wallet.pearl} · 髓 ${state.wallet.marrow} · 核 ${state.wallet.core}`, 16, 57, p.width - 32, 24, 11, C.muted);
    // List panels already own a clipped/virtualized ScrollView. Never nest a second
    // vertical view: normal swipes must reach their final row on a short screen.
    const panelHeight=['archive','poster'].includes(this.panel)||this.model.phase==='error'?Math.max(530,p.height):p.height;
    let body=header;
    if(panelHeight>p.height){
      const viewport=header.node('PanelScroll',panel,4,84,p.width-8,p.height-92);
      viewport.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
      const scroll=viewport.addComponent(ScrollView);scroll.horizontal=false;scroll.vertical=true;
      const content=header.node('PanelContent',viewport,0,0,p.width-8,panelHeight-84);scroll.content=content;
      const origin=header.node('PanelBody',content,-4,-84,p.width,panelHeight);
      body=new UiScope(origin,this.frames,this.font,l.touch);s.own(()=>body.dispose());
      header.text('ScrollHint','↕',p.width-24,p.height-26,14,20,12,C.amber);
    }
    s.own(this.model.subscribe(() => { this.panelDirty = true; }));
    const statusY = panelHeight - 50;
    const status = this.model.phase;
    if (status === 'loading' || status === 'error' && !(this.model.rewardPending && this.panel === 'equipment')) {
      this.fourState(body, status, this.model.notice, 92, panelHeight - 162);
      if (status === 'error') body.button('retry', r(16, panelHeight - 68, p.width - 32, 48), this.model.hasPending ? '重试原操作 / 领取原奖励' : '返回面板', () => { void this.model.retry(); }, !this.model.busy, undefined, true);
      if (status === 'error' && this.model.rewardPending) body.button('manage-space', r(16, panelHeight - 124, p.width - 32, 48), '管理装备 · 合成腾出位置', () => this.open('equipment'));
      return;
    }
    if (this.panel === 'upgrade') this.upgrade(body, p.width, panelHeight);
    else if (this.panel === 'tech') this.tech(body, p.width, panelHeight);
    else if (this.panel === 'equipment') this.equipment(body, p.width, panelHeight);
    else if (this.panel === 'supply') this.supply(body, p.width, panelHeight);
    else if (this.panel === 'tasks') this.tasks(body, p.width, panelHeight);
    else if (this.panel === 'poster' && state.objectives.record && this.posterPort) depthPosterView(body, p.width, panelHeight, state.objectives.record, this.posterPort);
    else {
      body.text('ArchiveRecord', `最深纪录 ${state.objectives.record?.depth ?? 0}m\n打卡 ${state.objectives.milestones.join(' / ') || '尚未到达 500m'}\n完整首日航程 ${state.objectives.completedDives.length}/3`, 20, 100, p.width - 40, 100, 15, C.mint);
      body.button('open-poster', r(16, 220, p.width - 32, 48), '查看深度海报', () => this.open('poster'), !!state.objectives.record);
      body.button('open-tasks', r(16, 280, p.width - 32, 48), '查看潜航目标', () => this.open('tasks'));
    }
    if (this.model.notice && !['equipment', 'tasks', 'poster'].includes(this.panel)) body.text('Notice', this.model.notice, 16, statusY, p.width - 32, 44, 11, C.mint);
    if (this.toast) this.toast.root.setSiblingIndex(this.root.children.length - 1);
    this.panelOpenedAt = Date.now();
  }
  /** 140ms entrance: the panel eases up 8px and fades in (LOO-70 §4 feedback spec). */
  private animateOverlay(): void {
    if (!this.overlay) return;
    const root = this.overlay.root;
    let opacity = root.getComponent(UIOpacity);
    if (!opacity) opacity = root.addComponent(UIOpacity);
    const t = Math.min(1, (Date.now() - this.panelOpenedAt) / 140);
    if (t >= 1) { root.setPosition(0, 0); opacity.opacity = 255; return; }
    const ease = 1 - (1 - t) * (1 - t);
    root.setPosition(0, -8 * (1 - ease));
    opacity.opacity = Math.round(255 * (.25 + .75 * ease));
  }
  private fourState(s: UiScope, phase: 'loading' | 'empty' | 'error', text: string, y: number, height: number): void {
    const title = phase === 'loading' ? '正在连接潜航终端…' : phase === 'error' ? '暂未确认' : '等待新的发现';
    s.text(`State-${phase}`, title, 22, y + 12, this.layout.panel.width - 44, 36, 20, phase === 'error' ? C.danger : C.mint);
    s.text('StateBody', text, 22, y + 58, this.layout.panel.width - 44, Math.max(60, height - 60), 14, C.muted);
  }
  private command(command: HarborCommand): void { void this.model.execute(command).catch(() => { /* duplicate input is ignored */ }); }
  private list(s: UiScope, name: string, rect: Rect, count: number, height: number, draw: (scope: UiScope, index: number) => void): void {
    this.lists.push(new VirtualRows(s, name, rect, count, height, draw));
  }
  private upgrade(s: UiScope, width: number, height: number): void {
    const rows = this.model.attributes(), state = this.model.snapshot;
    if (state.objectives.tutorial.active && state.objectives.tutorial.step === 5) rows.sort((a, b) => Number(!['cargo', 'oxygen'].includes(a.id)) - Number(!['cargo', 'oxygen'].includes(b.id)));
    // Current combat values stay outside the scroll area: they are the reference for every row below.
    s.box('CombatSummary', r(12, 86, width - 24, 118));
    s.text('CombatSummaryTitle', '当前战斗数值', 20, 90, 180, 18, 12, C.amber);
    summaryLines(state).forEach((line, i) => s.text(`CombatSummary-${i}`, line, 18, 107 + i * 15, width - 36, 15, 10, i < 2 ? C.text : C.mint));
    sourceLines(state).forEach((line, i) => s.text(`CombatSource-${i}`, line, 18, 168 + i * 14, width - 36, 14, 9, C.muted));
    this.list(s, 'UpgradeRows', r(12, 210, width - 24, Math.max(86, height - 266)), rows.length, 86, (row, i) => {
      const a = rows[i], preview = attributePreview(state, a.id); row.box('UpgradeRow', r(0, 0, width - 24, 80));
      const icon:Record<string,string>={hp:'equip_armor',attack:'icon_attack',attackSpeed:'icon_attack_speed',moveSpeed:'icon_move_speed',cargo:'icon_supply',oxygen:'equip_searchlight'};
      row.icon(icon[a.id]??'icon_upgrade',8,6,26);
      row.text('Attribute', `${a.title}  Lv.${a.level}`, 40, 5, 163, 24, 15);
      row.text('AttributeValues', `${preview.label} ${preview.from} → ${preview.to}${preview.unit}${preview.unchanged ? '（本级不变）' : ''}`, 12, 30, 214, 20, 11, C.mint);
      row.text('EstimatedCost', a.maxed ? '已达上限' : `预估 ${a.cost.crystal} 荧晶${a.cost.core !== '0' ? ` + ${a.cost.core} 渊核` : ''}`, 12, 53, 200, 21, 11, C.amber);
      row.button(`upgrade-${a.id}`, r(width - 116, 17, 80, 48), '强化', () => this.command({ type: 'attribute.upgrade', attribute: a.id }), !a.maxed);
    });
  }
  private tasks(s: UiScope, width: number, height: number): void {
    const rows = objectiveTasks(this.model.snapshot);
    this.list(s, 'ObjectiveRows', r(12, 88, width - 24, Math.max(70, height - 226)), rows.length, 116, (row, i) => {
      const task = rows[i];
      row.text(`task-${task.kind}`, `${task.title}\n${task.progress} / ${task.target} · 成功领奖 +20XP`, 6, 0, width - 36, 55, 14, task.ready ? C.mint : C.text);
      row.button(`claim-${task.kind}`, r(6, 59, width - 36, 44), task.claimed ? '已领取' : task.ready ? '领取奖励' : '继续探索', () => this.command({ type: 'task.claim', taskId: task.id }), task.ready && !this.model.busy && !this.model.hasPending);
    });
    s.text('FirstDayRule', '击杀后主动返航并结算计为一潜；救援继续原局。', 18, height - 132, width - 36, 42, 11, C.muted);
    s.button('replay-tutorial', r(18, height - 86, width - 36, 48), '重放首潜教学 · 首次奖励仅一次', () => {
      void this.model.execute({ type: 'tutorial.replay' }).then(() => { if (!this.model.hasPending && this.model.phase === 'normal') this.launch(); });
    }, !this.model.busy && !this.model.hasPending && !this.model.snapshot.activeDive);
  }
  private tech(s: UiScope, width: number, height: number): void {
    DEFAULT_BALANCE.tech.trees.forEach((tree, i) => s.button(`tree-${tree}`, r(12 + i * (width - 24) / 5, 87, (width - 24) / 5 - 3, 44), TREE_NAMES[tree], () => { this.tree = tree; this.drawPanel(); }, true, undefined, tree === this.tree));
    const rows = this.model.tech(this.tree);
    this.list(s, 'NodeTree', r(12, 140, width - 24, height - 200), rows.length, 84, (row, i) => {
      const n = rows[i]; row.box('TechNode', r(0, 0, width - 24, 78));
      // Riveted hexagonal node base under the icon (LOO-70 §4 tech-node skin).
      row.skin('TechNodeBase', 'loo70_ui_tech_node', r(2, 17, 44, 44));
      row.text('PrerequisiteLine', i ? '│' : '●', 8, 0, 12, 76, 18, C.mint);
      row.text('NodeName', `${TREE_NAMES[n.tree]}  ${i + 1} / 20${n.learned ? ' · 已解锁' : ''}`, 26, 4, 190, 26, 14);
      row.text('Requires', `${n.requires.length ? `前置 ${n.requires.join(' / ')}` : '分支起点'} · 增益 ${Math.round(n.effect * 100)}%`, 26, 30, 190, 20, 11, C.muted);
      row.text('EstimatedCost', `${n.crystal} 荧晶 + ${n.core} 渊核`, 26, 52, 190, 20, 11, C.amber);
      row.button(`unlock-${n.id}`, r(width - 111, 16, 75, 48), n.learned ? '已掌握' : n.enabled ? '解锁' : '前置锁定', () => this.command({ type: 'tech.unlock', nodeId: n.id }), n.enabled);
    });
  }
  private equipment(s: UiScope, width: number, height: number): void {
    const state = this.model.snapshot, unlocked = state.playerLevel >= DEFAULT_BALANCE.equipment.unlockLevel;
    if (!unlocked) { this.fourState(s, 'empty', `挂载装备与珍珠箱将在 Lv.${DEFAULT_BALANCE.equipment.unlockLevel} 开放。\n第四槽将在 Lv.${DEFAULT_BALANCE.equipment.fourthSlotLevel} 开放。`, 110, height - 180); return; }
    const inventory = state.inventory;
    const compact=height<530;
    let preview: ReturnType<HarborModel['synthesis']> | undefined;
    try { preview = this.model.synthesis([this.mainId, ...this.auxiliary].map(id => inventory.find(i => i.id === id)!).filter(Boolean), this.mainId); } catch { /* selection not complete */ }
    const previewText = preview ? `成品 ${QUALITY_NAMES[preview.item.quality]} Lv.${preview.item.level} · 返还 ${preview.refund.marrow}髓 / ${preview.refund.tickets}券\n消耗辅料 ${this.auxiliary.map(id => this.itemLabel(inventory.find(i => i.id === id))).join('、')}` : '三合一：先选主件，再选同模板同品质的两个辅料。';
    const merge=():void=>{
      if(!this.mergeConfirm){this.mergeConfirm=true;this.drawPanel();return;}
      const mainId=this.mainId,itemIds=[mainId,...this.auxiliary];
      this.mainId='';this.auxiliary=[];this.focusedId='';this.mergeConfirm=false;this.compactSynthesis=false;
      this.command({type:'equipment.synthesize',mainId,itemIds});
    };
    if(compact&&this.compactSynthesis){
      s.text('SynthesisHeading','三合一 / 确认消耗',18,96,width-36,32,20,C.amber);
      s.text('SynthesisPreview',previewText,18,136,width-36,Math.max(70,height-270),13,C.text);
      s.button('back-inventory',r(14,height-118,width-28,44),'返回收纳舱',()=>{this.compactSynthesis=false;this.mergeConfirm=false;this.drawPanel();});
      s.button('merge',r(14,height-56,width-28,44),'确认消耗所选三件 · 合成',merge,!!preview,undefined,true);
      return;
    }
    const cardW = (width - 24) / 4 - 4;
    for (let i = 0; i < 4; i++) {
      const locked = i === 3 && state.playerLevel < DEFAULT_BALANCE.equipment.fourthSlotLevel, card = slotReadout(state, i);
      const n = s.button(`slot-${i}`, r(12 + i * (width - 24) / 4, 85, cardW, 62), '', () => { this.slot = i; this.drawPanel(); }, !locked, undefined, this.slot === i);
      // Recessed mount socket under the card content (LOO-70 §4 socket skin).
      s.skin(`slot-${i}-socket`, 'loo70_ui_socket', r(2, 2, cardW - 4, 58), n as Node);
      if (locked) {
        const title = s.text(`slot-${i}-title`, `Lv.${DEFAULT_BALANCE.equipment.fourthSlotLevel} 锁定`, 0, 18, cardW, 22, 11, C.muted, n);
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
      } else {
        const title = s.text(`slot-${i}-title`, card.title, 0, 2, cardW, 20, 11, C.text, n); title.horizontalAlign = Label.HorizontalAlign.CENTER;
        const line1 = s.text(`slot-${i}-line1`, card.line1, 0, 22, cardW, 18, 9, card.empty ? C.muted : C.mint, n); line1.horizontalAlign = Label.HorizontalAlign.CENTER;
        if (card.line2) { const line2 = s.text(`slot-${i}-line2`, card.line2, 0, 40, cardW, 18, 9, C.muted, n); line2.horizontalAlign = Label.HorizontalAlign.CENTER; }
      }
    }
    if (!compact&&!inventory.some(i => i.id === this.focusedId)) s.text('SelectedSlot', `当前槽 ${this.slot + 1} · ${this.slot < 2 ? '仅主武器' : '仅辅件'} · 已选主件 ${this.mainId ? this.itemLabel(inventory.find(i => i.id === this.mainId)) : '无'}`, 14, 151, width - 28, 22, 10, C.muted);
    const focused = inventory.find(i => i.id === this.focusedId);
    let listY = 172;
    if (focused) {
      const maxed = focused.level >= DEFAULT_BALANCE.equipment.maxLevels[focused.quality];
      const cost = maxed ? '已满级' : `${equipmentUpgradeCost(focused)} 髓 / 1券`;
      s.text('EquipmentCost', `${this.itemLabel(focused)} · ${cost}（余${state.tickets}券）`, 14, 151, width - 28, 18, 10, C.amber);
      const detail = itemDetail(state, focused);
      detail.lines.forEach((line, i) => s.text(`EquipmentDetail-${i}`, line, 14, 169 + i * 16, width - 28, 16, 10, i === 0 ? C.mint : C.muted));
      const compare = equipComparison(state, focused.id, this.slot), compareText = comparisonLine(compare, this.slot);
      const compareY = 169 + detail.lines.length * 16;
      s.text('EquipmentCompare', compareText, 14, compareY, width - 28, 30, 10, compare.compatible ? C.amber : C.danger);
      const actions: [string, string, HarborCommand, boolean][] = [
        ['equip', '装到该槽', { type: 'equipment.equip', itemId: focused.id, slot: this.slot }, (this.slot < 2) === (DEFAULT_BALANCE.equipment.templates.indexOf(focused.template) < 4)],
        ['level-marrow', '用髓升级', { type: 'equipment.upgrade', itemId: focused.id, payment: 'marrow' }, !maxed],
        ['level-ticket', '用券升级', { type: 'equipment.upgrade', itemId: focused.id, payment: 'ticket' }, !maxed && state.tickets > 0],
        ['lock', focused.locked ? '解除锁定' : '锁定', { type: 'equipment.lock', itemId: focused.id, locked: !focused.locked }, true],
      ];
      const actionsY = compareY + 34;
      actions.forEach(([key, title, command, enabled], i) => s.button(key, r(12 + i * (width - 24) / 4, actionsY, (width - 24) / 4 - 4, 44), title, () => this.command(command), enabled));
      listY = actionsY + 52;
    }
    const footer = compact?70:110;
    if (!inventory.length) this.fourState(s, 'empty', '收纳舱暂无装备，前往补给打开珍珠箱。', listY, height - listY - 80);
    else if(compact&&focused)s.button('back-inventory',r(14,Math.min(listY,height-108),width-28,44),'← 返回收纳舱',()=>{this.focusedId='';this.drawPanel();});
    else this.list(s, 'VirtualInventory', r(12, listY, width - 24, Math.max(44, height - listY - footer)), inventory.length, 112, (row, index) => {
      const item = inventory[index], selected = item.id === this.focusedId;
      const n = row.button(`item-${item.id}`, r(0, 0, width - 24, 106), '', () => { this.focusedId = item.id; this.mergeConfirm = false; this.drawPanel(); }, true, undefined, selected);
      row.icon(EQUIP_ICON[item.template] ?? `equip_${item.template}`, 5, 8, 48, 48, n);
      row.text('ItemName', this.itemLabel(item), 58, 3, width - 100, 22, 13, C.text, n);
      row.text('ItemState', `${item.equipped ? '已装配' : item.locked ? '已锁定' : this.mainId === item.id ? '★ 主装备' : this.auxiliary.includes(item.id) ? '◆ 辅料' : '未装配'} · 升级投入 ${item.invested.marrow}髓 / ${item.invested.tickets}券`, 58, 24, width - 100, 18, 10, C.muted, n);
      row.text('ItemStats', itemKeyStats(state, item), 58, 42, width - 100, 16, 10, C.mint, n);
      if (!item.equipped && !item.locked && item.quality < 4) {
        row.button(`main-${item.id}`, r(58, 58, 92, 44), '选为主件', () => { this.mainId = item.id; this.auxiliary = []; this.mergeConfirm = false; this.drawPanel(); });
        row.button(`aux-${item.id}`, r(157, 58, 92, 44), this.auxiliary.includes(item.id) ? '取消辅料' : '选为辅料', () => {
          if (!this.mainId || this.mainId === item.id) return;
          if (this.auxiliary.includes(item.id)) this.auxiliary = this.auxiliary.filter(id => id !== item.id);
          else if (this.auxiliary.length < 2) this.auxiliary.push(item.id);
          this.mergeConfirm = false; this.drawPanel();
        }, !!this.mainId && this.mainId !== item.id);
      }
    });
    if(compact){
      s.button('compact-synthesis',r(14,height-56,width-28,44),preview?'三合一 · 查看消耗与返还':'三合一 · 请先选择主件与两件辅料',()=>{this.compactSynthesis=true;this.mergeConfirm=true;this.drawPanel();},!!preview,undefined,true);
      return;
    }
    // A second explicit confirmation is required after seeing the exact consumed instances and refunds.
    const footerY = height - 106;
    s.text('SynthesisPreview', previewText, 14, footerY, width - 28, 48, 11, C.amber);
    s.button('merge', r(14, height - 55, width - 28, 44), this.mergeConfirm ? '确认消耗所选三件 · 合成' : '查看三合一确认', merge, !!preview, undefined, true);
  }
  private itemLabel(item?: Equipment): string { return item ? `${EQUIPMENT_NAMES[item.template]} ${QUALITY_NAMES[item.quality]} Lv.${item.level}` : '无'; }
  private supply(s: UiScope, width: number, height: number): void {
    const state = this.model.snapshot, lowLevel = state.playerLevel < DEFAULT_BALANCE.ads.unlockLevel;
    const names = ['gift', 'blessing', 'sonar', 'silver', 'gold'] as const;
    this.list(s, 'RewardCards', r(12, 87, width - 24, height - 145), names.length, 204, (row, index) => {
      const kind = names[index], w = width - 24, box = kind === 'gold' || kind === 'silver';
      row.box(`Reward-${kind}`, r(0, 0, w, 196));
      row.icon(`icon_${box ? `${kind}_chest` : kind}`, 12, 10, 42);
      const title = kind === 'gift' ? '深海馈赠' : kind === 'blessing' ? `远航祝福 · ${DEFAULT_BALANCE.ads.blessingDurationMs / 60000}分钟` : kind === 'sonar' ? `声呐协击 · ${DEFAULT_BALANCE.ads.sonarDurationMs / 60000}分钟` : kind === 'silver' ? '白银珍珠箱' : '黄金珍珠箱';
      row.text('RewardTitle', title, 62, 8, w - 74, 30, 16);
      row.text('DailyCount', lowLevel ? `Lv.${DEFAULT_BALANCE.ads.unlockLevel} 开放视频补给` : `今日视频剩余 ${this.model.adRemaining(kind)} / ${DEFAULT_BALANCE.ads.slots[kind]}`, 62, 39, w - 74, 22, 11, C.muted);
      if (kind === 'blessing') {
        const timer = row.text('BlessingTimer', '', 12, 69, w - 24, 22, 12, C.mint); this.timers[0] = timer; row.own(() => { if (this.timers[0] === timer) delete this.timers[0]; });
        DEFAULT_BALANCE.ads.blessingChoices.forEach((choice, i) => row.button(`blessing-${choice}`, r(8 + i * (w - 16) / 3, 112, (w - 16) / 3 - 4, 52), `${['收益', '氧气', '舱容'][i]} +${Math.round((DEFAULT_BALANCE.ads.blessingMultipliers[i] - 1) * 100)}%`, () => { void this.model.watch('blessing', { choice }); }, !lowLevel && this.model.adRemaining(kind) > 0));
      } else if (kind === 'sonar') {
        const timer = row.text('SonarTimer', '', 12, 69, w - 24, 22, 12, C.mint); this.timers[1] = timer; row.own(() => { if (this.timers[1] === timer) delete this.timers[1]; });
        row.text('SonarHint', '基础自动攻击常开；协击到期前1分钟可续。', 12, 91, w - 24, 28, 11, C.muted);
        row.button('ad-sonar', r(12, 130, w - 24, 48), '观看视频 · 激活协击', () => { void this.model.watch('sonar'); }, !lowLevel && this.model.adRemaining(kind) > 0 && this.model.buffSeconds('sonar') <= DEFAULT_BALANCE.ads.sonarRenewWindowMs / 1000);
      } else if (box) {
        row.text('BoxPrice', `${DEFAULT_BALANCE.boxes[kind].price} 珍珠 / 次 · 十连同价`, 12, 69, w - 24, 22, 12, C.amber);
        row.text('Pity', kind === 'gold' ? `黄金累计 ${state.goldPity}/${DEFAULT_BALANCE.boxes.gold.pity} · 视频/珍珠共享保底` : '白银独立抽取 · 不影响黄金保底', 12, 94, w - 24, 24, 11, C.muted);
        const unlocked = state.playerLevel >= DEFAULT_BALANCE.equipment.unlockLevel;
        row.button(`draw-${kind}`, r(10, 134, 89, 48), unlocked ? '珍珠单抽' : `Lv.${DEFAULT_BALANCE.equipment.unlockLevel} 开放`, () => this.command({ type: 'box.draw', box: kind, count: 1 }), unlocked && state.inventory.length < DEFAULT_BALANCE.equipment.inventoryLimit);
        row.button(`draw10-${kind}`, r(105, 134, 89, 48), '珍珠十连', () => this.command({ type: 'box.draw', box: kind, count: 10 }), unlocked && state.inventory.length + 10 <= DEFAULT_BALANCE.equipment.inventoryLimit);
        row.button(`ad-${kind}`, r(200, 134, w - 210, 48), '视频单抽', () => { void this.model.watch(kind); }, unlocked && !lowLevel && this.model.adRemaining(kind) > 0 && state.inventory.length < DEFAULT_BALANCE.equipment.inventoryLimit);
      } else {
        // The showcase pays exactly what is displayed here; labels refresh every frame from the model clock.
        const offer = row.text('GiftOffer', '', 12, 69, w - 24, 26, 14, C.mint);
        const refresh = row.text('GiftRefresh', '', 12, 99, w - 24, 20, 11, C.muted);
        this.timers[2] = offer; this.timers[3] = refresh;
        row.own(() => { if (this.timers[2] === offer) delete this.timers[2]; if (this.timers[3] === refresh) delete this.timers[3]; });
        row.button('ad-gift', r(12, 132, w - 24, 48), '观看视频 · 领取当前馈赠', () => { void this.model.watch('gift'); }, !lowLevel && this.model.adRemaining(kind) > 0);
      }
    });
    this.lists[this.lists.length - 1]?.scrollTo(this.supplyFocus);
  }
}
