import { Node, UITransform, SpriteFrame, BitmapFont, Widget, BlockInputEvents, Label, Color } from 'cc';
import { DEFAULT_BALANCE, equipmentUpgradeCost } from '@abyss-hunter/shared';
import type { Equipment } from '@abyss-hunter/shared';
import { HarborModel, TREE_NAMES, EQUIPMENT_NAMES, QUALITY_NAMES } from '../meta/HarborModel';
import type { HarborCommand } from '../meta/HarborModel';
import { harborLayout } from './harborLayout';
import type { HarborInsets, Rect } from './harborLayout';
import { UiScope, VirtualRows, C } from './HarborKit';
export type Panel = 'upgrade' | 'tech' | 'equipment' | 'supply' | 'archive';
const TITLES: Record<Panel, string> = { upgrade: '机体强化', tech: '潜航科技', equipment: '挂载装备', supply: '远航补给', archive: '探索档案' };
const EQUIP_ICON: Record<string, string> = { light: 'equip_searchlight' };
const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
/** Scene-native UI. Base navigation survives overlay close; each overlay has its own subscription scope. */
export class HarborView {
  readonly root: Node;
  layout = harborLayout(375, 812);
  panel?: Panel;
  private base?: UiScope;
  private overlay?: UiScope;
  private offBase?: () => void;
  private panelDirty = false;
  private tree = 'attack';
  private mainId = '';
  private auxiliary: string[] = [];
  private slot = 0;
  private focusedId = '';
  private mergeConfirm = false;
  private supplyFocus = 0;
  private signature = '';
  private lists: VirtualRows[] = [];
  private timers: Label[] = [];
  constructor(private readonly parent: Node, readonly model: HarborModel, private readonly frames: ReadonlyMap<string, SpriteFrame>, private readonly font: BitmapFont | undefined,
    private readonly launch: () => void) {
    this.root = new Node('HarborRoot'); this.root.layer = parent.layer; parent.addChild(this.root); this.root.addComponent(UITransform).setAnchorPoint(0, 1);
    this.offBase = model.subscribe(() => { this.panelDirty = true; });
  }
  get liveRows(): number { return this.lists.reduce((sum, list) => sum + list.liveRows, 0); }
  resize(width: number, height: number, insets: HarborInsets): void {
    const l = harborLayout(width, height, insets), key = JSON.stringify(l);
    if (key === this.signature) return;
    this.signature = key; this.layout = l;
    this.root.setScale(l.scale, l.scale, 1); this.root.setPosition(-width / 2, height / 2);
    this.root.getComponent(UITransform)!.setContentSize(375, l.height);
    this.buildBase(); this.drawPanel();
  }
  update(): void {
    if (this.panelDirty) { this.panelDirty = false; this.buildBase(); this.drawPanel(); }
    this.timers.forEach((label, i) => { const seconds = this.model.buffSeconds(i === 0 ? 'blessing' : 'sonar'); label.string = seconds ? `生效中 ${Math.floor(seconds / 60)}分${seconds % 60}秒` : '当前未激活'; });
  }
  open(panel: Panel, supplyFocus = 0): void { this.supplyFocus = supplyFocus; this.panel = panel; this.mergeConfirm = false; this.drawPanel(); }
  close(): void { this.overlay?.dispose(); this.overlay = undefined; this.lists = []; this.timers = []; this.panel = undefined; }
  destroy(): void { this.close(); this.offBase?.(); this.base?.dispose(); this.root.destroy(); }
  private scope(name: string): UiScope {
    const n = new Node(name); n.layer = this.parent.layer; this.root.addChild(n); n.addComponent(UITransform).setAnchorPoint(0, 1);
    return new UiScope(n, this.frames, this.font);
  }
  private buildBase(): void {
    this.base?.dispose(); const s = this.base = this.scope('HarborCanvas'), l = this.layout, state = this.model.snapshot;
    // Foreground and submersible retain original aspect ratio.
    s.icon('bg_harbor_far', 0, 0, 375, l.height);
    s.icon('deco_harbor_left', 0, l.height * 0.29, 86, 344);
    s.icon('deco_harbor_right', 289, l.height * 0.29, 86, 344);
    s.box('TitlePlate', r(l.left, l.top, 375 - l.left - l.right, 50));
    s.text('HarborTitle', '潮汐母港', l.left + 14, l.top + 5, 170, 27, 23);
    s.text('HarborSubtitle', 'ABYSS / 远航准备', l.left + 15, l.top + 32, 180, 14, 10, C.muted);
    s.text('PlayerLevel', `潜航员 Lv.${state.playerLevel}`, 248, l.top + 13, 105, 28, 12, C.amber);
    const wallet = s.box('Wallet', r(l.left, l.top + 58, 375 - l.left - l.right, 42));
    const currencies = ['crystal', 'pearl', 'marrow', 'core'] as const;
    currencies.forEach((currency, i) => {
      const x = 6 + i * (375 - l.left - l.right - 12) / 4;
      s.icon(`icon_${currency === 'core' ? 'core_cyan' : currency}`, x, 10, 22, 22, wallet);
      const raw = state.wallet[currency], group = raw.length >= 9 ? 8 : raw.length >= 6 ? 4 : 0;
      const whole = group ? raw.slice(0, -group) : raw;
      const number = group && whole.length < 3 && raw[raw.length - group] !== '0' ? `${whole}.${raw[raw.length - group]}` : whole;
      s.text(`wallet-${currency}`, number, x + 25, 8, group ? 34 : 52, 26, 12, currency === 'pearl' ? C.amber : C.text, wallet, true);
      if (group) s.text(`wallet-${currency}-unit`, group === 8 ? '亿' : '万', x + 59, 10, 16, 22, 10, C.muted, wallet);
    });
    const icons: Record<string, string> = { gift: 'gift', blessing: 'blessing', sonar: 'sonar', archive: 'archive', upgrade: 'upgrade', tech: 'tech', equipment: 'equipment', supply: 'supply' };
    const labels: Record<string, string> = { gift: '深海馈赠', blessing: '远航祝福', sonar: '声呐协击', archive: '图鉴 P1', upgrade: '强化', tech: '科技', equipment: '装备', supply: '补给' };
    for (const [name, rect] of Object.entries(l.targets)) {
      if (name === 'launch') continue;
      const n = s.button(name, rect, '', () => this.open(['gift', 'blessing', 'sonar'].includes(name) ? 'supply' : name as Panel, Math.max(0, ['gift', 'blessing', 'sonar'].indexOf(name))));
      s.icon(`icon_${icons[name]}`, rect.width / 2 - 15, 3, 30, 30, n);
      const label = s.text(`${name}-title`, labels[name], 0, 35, rect.width, 21, 11, name === 'archive' ? C.muted : C.text, n); label.horizontalAlign = Label.HorizontalAlign.CENTER;
    }
    const heroY = Math.max(l.top + 186, l.navY - 352);
    s.icon('hero_h01_harbor', 72, heroY, 230, 230);
    s.text('SubDisplay', 'H-01  ·  潮汐号', 104, Math.min(heroY + 222, l.navY - 123), 175, 28, 17, C.text);
    s.text('TaskStrip', state.activeDive ? '潜航现场已保存 · 继续原航程' : '自动攻击已就绪 · 随时出发', l.left + 12, l.navY - 113, 280, 24, 12, C.text);
    s.button('LaunchButton', l.targets.launch, state.activeDive ? '继续潜航   ↓' : '出发 · 探索透光层   ↓', () => { if (!this.model.busy && !this.model.hasPending) this.launch(); }, !this.model.busy && !this.model.hasPending, undefined, true);
    if (this.overlay) this.overlay.root.setSiblingIndex(this.root.children.length - 1);
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
    const body = new UiScope(panel, this.frames, this.font); s.own(() => body.dispose());
    body.text('PanelTitle', TITLES[this.panel], 16, 8, p.width - 80, 34, 22);
    body.button('close', r(p.width - 54, 4, 48, 44), '关闭', () => this.close());
    const state = this.model.snapshot;
    body.text('PanelBalance', `荧晶 ${state.wallet.crystal} · 珍珠 ${state.wallet.pearl} · 髓 ${state.wallet.marrow} · 核 ${state.wallet.core}`, 16, 47, p.width - 32, 34, 11, C.amber);
    s.own(this.model.subscribe(() => { this.panelDirty = true; }));
    const statusY = p.height - 50;
    const status = this.model.phase;
    if (status === 'loading' || status === 'error' && !(this.model.rewardPending && this.panel === 'equipment')) {
      this.fourState(body, status, this.model.notice, 92, p.height - 162);
      if (status === 'error') body.button('retry', r(16, p.height - 68, p.width - 32, 48), this.model.hasPending ? '重试原操作 / 领取原奖励' : '返回面板', () => { void this.model.retry(); }, !this.model.busy, undefined, true);
      if (status === 'error' && this.model.rewardPending) body.button('manage-space', r(16, p.height - 124, p.width - 32, 48), '管理装备 · 合成腾出位置', () => this.open('equipment'));
      return;
    }
    if (this.panel === 'upgrade') this.upgrade(body, p.width, p.height);
    else if (this.panel === 'tech') this.tech(body, p.width, p.height);
    else if (this.panel === 'equipment') this.equipment(body, p.width, p.height);
    else if (this.panel === 'supply') this.supply(body, p.width, p.height);
    else this.fourState(body, 'empty', 'P1 档案尚未开放\n图鉴 / 共生体 / 好友榜 / 海报\n继续下潜，期待下一次发现。', 120, p.height - 200);
    if (this.model.notice && this.panel !== 'equipment') body.text('Notice', this.model.notice, 16, statusY, p.width - 32, 44, 11, C.mint);
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
    const rows = this.model.attributes();
    this.list(s, 'UpgradeRows', r(12, 88, width - 24, height - 148), rows.length, 86, (row, i) => {
      const a = rows[i]; row.box('UpgradeRow', r(0, 0, width - 24, 80));
      row.text('Attribute', `${a.title}  Lv.${a.level}`, 12, 5, 205, 24, 15);
      row.text('AttributeValues', `${Number(a.value.toFixed(2))} → ${Number(a.next.toFixed(2))}`, 12, 30, 170, 20, 12, C.mint);
      row.text('EstimatedCost', a.maxed ? '已达上限' : `预估 ${a.cost.crystal} 荧晶${a.cost.core !== '0' ? ` + ${a.cost.core} 渊核` : ''}`, 12, 53, 200, 21, 11, C.amber);
      row.button(`upgrade-${a.id}`, r(width - 116, 17, 80, 48), '强化', () => this.command({ type: 'attribute.upgrade', attribute: a.id }), !a.maxed);
    });
  }
  private tech(s: UiScope, width: number, height: number): void {
    DEFAULT_BALANCE.tech.trees.forEach((tree, i) => s.button(`tree-${tree}`, r(12 + i * (width - 24) / 5, 87, (width - 24) / 5 - 3, 44), TREE_NAMES[tree], () => { this.tree = tree; this.drawPanel(); }, true, undefined, tree === this.tree));
    const rows = this.model.tech(this.tree);
    this.list(s, 'NodeTree', r(12, 140, width - 24, height - 200), rows.length, 84, (row, i) => {
      const n = rows[i]; row.box('TechNode', r(0, 0, width - 24, 78));
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
    for (let i = 0; i < 4; i++) {
      const item = inventory.find(e => (e as Equipment & { slot?: number }).slot === i && e.equipped), locked = i === 3 && state.playerLevel < DEFAULT_BALANCE.equipment.fourthSlotLevel;
      s.button(`slot-${i}`, r(12 + i * (width - 24) / 4, 85, (width - 24) / 4 - 4, 48), locked ? `Lv.${DEFAULT_BALANCE.equipment.fourthSlotLevel} 锁定` : item ? EQUIPMENT_NAMES[item.template] : i < 2 ? `主武器 ${i + 1}` : `辅件 ${i - 1}`, () => { this.slot = i; this.drawPanel(); }, !locked, undefined, this.slot === i);
    }
    if (!inventory.some(i => i.id === this.focusedId)) s.text('SelectedSlot', `当前槽 ${this.slot + 1} · ${this.slot < 2 ? '仅主武器' : '仅辅件'} · 已选主件 ${this.mainId ? this.itemLabel(inventory.find(i => i.id === this.mainId)) : '无'}`, 14, 137, width - 28, 28, 11, C.muted);
    const focused = inventory.find(i => i.id === this.focusedId);
    if (focused) {
      const maxed = focused.level >= DEFAULT_BALANCE.equipment.maxLevels[focused.quality];
      const cost = maxed ? '已满级' : equipmentUpgradeCost(focused);
      s.text('EquipmentCost', `${this.itemLabel(focused)} → Lv.${maxed ? focused.level : focused.level + 1} · ${cost} 髓 / 1券（余${state.tickets}）`, 14, 137, width - 28, 28, 11, C.amber);
      const actions: [string, string, HarborCommand, boolean][] = [
        ['equip', '装到当前槽', { type: 'equipment.equip', itemId: focused.id, slot: this.slot }, (this.slot < 2) === (DEFAULT_BALANCE.equipment.templates.indexOf(focused.template) < 4)],
        ['level-marrow', '用髓升级', { type: 'equipment.upgrade', itemId: focused.id, payment: 'marrow' }, !maxed],
        ['level-ticket', '用券升级', { type: 'equipment.upgrade', itemId: focused.id, payment: 'ticket' }, !maxed && state.tickets > 0],
        ['lock', focused.locked ? '解除锁定' : '锁定', { type: 'equipment.lock', itemId: focused.id, locked: !focused.locked }, true],
      ];
      actions.forEach(([key, title, command, enabled], i) => s.button(key, r(12 + i * (width - 24) / 4, 168, (width - 24) / 4 - 4, 44), title, () => this.command(command), enabled));
    }
    const listY = focused ? 220 : 169, footer = 110;
    if (!inventory.length) this.fourState(s, 'empty', '收纳舱暂无装备，前往补给打开珍珠箱。', listY, height - listY - 80);
    else this.list(s, 'VirtualInventory', r(12, listY, width - 24, Math.max(44, height - listY - footer)), inventory.length, 112, (row, index) => {
      const item = inventory[index], selected = item.id === this.focusedId;
      const n = row.button(`item-${item.id}`, r(0, 0, width - 24, 106), '', () => { this.focusedId = item.id; this.mergeConfirm = false; this.drawPanel(); }, true, undefined, selected);
      row.icon(EQUIP_ICON[item.template] ?? `equip_${item.template}`, 5, 8, 48, 48, n);
      row.text('ItemName', this.itemLabel(item), 58, 3, width - 100, 24, 13, C.text, n);
      row.text('ItemState', `${item.equipped ? '已装配' : item.locked ? '已锁定' : this.mainId === item.id ? '★ 主装备' : this.auxiliary.includes(item.id) ? '◆ 辅料' : '未装配'} · 升级投入 ${item.invested.marrow}髓 / ${item.invested.tickets}券`, 58, 26, width - 100, 20, 10, C.muted, n);
      if (!item.equipped && !item.locked && item.quality < 4) {
        row.button(`main-${item.id}`, r(58, 47, 92, 44), '选为主件', () => { this.mainId = item.id; this.auxiliary = []; this.mergeConfirm = false; this.drawPanel(); });
        row.button(`aux-${item.id}`, r(157, 47, 92, 44), this.auxiliary.includes(item.id) ? '取消辅料' : '选为辅料', () => {
          if (!this.mainId || this.mainId === item.id) return;
          if (this.auxiliary.includes(item.id)) this.auxiliary = this.auxiliary.filter(id => id !== item.id);
          else if (this.auxiliary.length < 2) this.auxiliary.push(item.id);
          this.mergeConfirm = false; this.drawPanel();
        }, !!this.mainId && this.mainId !== item.id);
      }
    });
    // A second explicit confirmation is required after seeing the exact consumed instances and refunds.
    const footerY = height - 106;
    let preview: ReturnType<HarborModel['synthesis']> | undefined;
    try { preview = this.model.synthesis([this.mainId, ...this.auxiliary].map(id => inventory.find(i => i.id === id)!).filter(Boolean), this.mainId); } catch { /* selection not complete */ }
    const previewText = preview ? `成品 ${QUALITY_NAMES[preview.item.quality]} Lv.${preview.item.level} · 返还 ${preview.refund.marrow}髓 / ${preview.refund.tickets}券\n消耗辅料 ${this.auxiliary.map(id => this.itemLabel(inventory.find(i => i.id === id))).join('、')}` : '三合一：先选主件，再选同模板同品质的两个辅料。';
    s.text('SynthesisPreview', previewText, 14, footerY, width - 28, 48, 11, C.amber);
    s.button('merge', r(14, height - 55, width - 28, 44), this.mergeConfirm ? '确认消耗所选三件 · 合成' : '查看三合一确认', () => {
      if (!this.mergeConfirm) { this.mergeConfirm = true; this.drawPanel(); return; }
      const mainId = this.mainId, itemIds = [mainId, ...this.auxiliary];
      this.mainId = ''; this.auxiliary = []; this.focusedId = ''; this.mergeConfirm = false;
      this.command({ type: 'equipment.synthesize', mainId, itemIds });
    }, !!preview, undefined, true);
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
        row.text('GiftHint', '可获得荧晶、珍珠、深海髓或渊核。\n完整观看并确认后入账。', 12, 73, w - 24, 44, 12, C.muted);
        row.button('ad-gift', r(12, 132, w - 24, 48), '观看视频 · 获取馈赠', () => { void this.model.watch('gift'); }, !lowLevel && this.model.adRemaining(kind) > 0);
      }
    });
    this.lists[this.lists.length - 1]?.scrollTo(this.supplyFocus);
  }
}
