import { BlockInputEvents, Button, Color, Graphics, Label, Layers, Node, UITransform, isValid } from 'cc';
import type { DiveSession } from '../battle/DiveSession';
import { hudLayout } from './hudLayout';
import type { HudInsets, HudLayout, HudRect } from './hudLayout';
import type { DiveAdView } from '../services/local/DiveAdModel';
import { SeaWorldView } from './SeaWorldView';
import type { LocalState } from '../services/local/model';
import { objectiveTasks, tutorialHint } from '../services/local/Objectives';
import { WorldProjection } from './WorldProjection';

const ink = new Color(7, 25, 35), panel = new Color(15, 43, 54), line = new Color(43, 82, 90);
const mint = new Color(105, 233, 198), cream = new Color(233, 240, 218), muted = new Color(126, 165, 169);
const amber = new Color(255, 189, 99), danger = new Color(255, 110, 111);

export type HudAction = 'pause' | 'return' | 'primary' | 'secondary' | 'sonar' | 'oxygen' | 'dismissOxygen';

/** Spec cap for concurrent damage numbers (技术方案 §活跃对象: 飘字30组). */
const TEXT_POOL = 30;

/** Cocos presentation only: reads a session, emits commands through callbacks. */
export class DiveHud {
  readonly root: Node;
  readonly sea: SeaWorldView;
  readonly projection = new WorldProjection();
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
  private depositStarted = 0;
  private joystick?: { origin: { x: number; y: number }; tip: { x: number; y: number } };
  private currentSession?: DiveSession;
  private hintKey = '';
  private hintUntil = 0;

  constructor(parent: Node, private readonly action: (action: HudAction) => void, readonly lowEnd = false) {
    this.sea = new SeaWorldView(parent, lowEnd);
    this.root = this.node('DiveHUD', parent);
  }

  prepare(session: DiveSession): void { this.sea.prepare(session); }
  retryAssets(): void { this.sea.retry(); }

  setJoystick(origin?: { x: number; y: number }, tip?: { x: number; y: number }): void {
    this.joystick = origin && tip ? { origin, tip } : undefined;
  }
  /** Only actual visible controls and blocking overlays exclude a combat gesture. */
  blocksMovement(x: number, y: number): boolean {
    if (this.overlay?.active) return true;
    const l = this.layout;
    const rects = [l.pause, l.return, l.sonar];
    if (this.oxygenCard?.active) rects.push(l.oxygenAd, l.oxygenDismiss);
    return rects.some(r => x >= r.x && x <= r.x+r.width && y >= r.y && y <= r.y+r.height);
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
    this.sea.resize(width, l.height);
    this.world = this.node('Ocean', this.root).addComponent(Graphics);
    this.chrome = this.node('Instruments', this.root).addComponent(Graphics);
    this.label('hp', '', 195 - l.right, l.top + 12, 158, 20, 12, cream);
    this.label('oxygenGauge', '', l.oxygen.x, l.oxygen.y, l.oxygen.width, 20, 12, cream);
    this.label('cargo', '', l.cargo.x, l.cargo.y, l.cargo.width, 20, 11, cream);
    this.label('status', '', l.status.x + 4, l.status.y + 2, l.status.width - 8, 22, 11, amber);
    this.label('depth', '', 255 - l.right, l.top + 40, 103, 22, 16, mint);
    this.label('feedback', '', l.left + 18, l.height - 85, 339 - l.left - l.right, 24, 11, amber);
    this.label('guidance', '', l.left + 18, l.top + 98, 339 - l.left - l.right, 38, 12, cream);
    this.button('pause', l.pause, '暂停', this.root);
    this.button('return', l.return, '安全返航 ↑', this.root);
    this.button('sonar', l.sonar, '', this.root);
    this.oxygenCard = this.node('OxygenCard', this.root);
    const cardGraphics = this.oxygenCard.addComponent(Graphics);
    this.box(cardGraphics, l.oxygenCard, panel, 12);
    this.box(cardGraphics, l.oxygenAd, new Color(32, 83, 80), 8);
    this.box(cardGraphics, l.oxygenDismiss, ink, 8);
    this.label('oxygenBody', '', l.oxygenCard.x + 12, l.oxygenCard.y + 8, l.oxygenCard.width-24, 32, 12, cream, this.oxygenCard);
    this.button('oxygen', l.oxygenAd, '观看 · 氧气回满', this.oxygenCard);
    this.button('dismissOxygen', l.oxygenDismiss, '坚持上浮 · 关闭', this.oxygenCard);
    if (!this.lowEnd) for (let i = 0; i < TEXT_POOL; i++) {
      this.label(`dmg-${i}`, '', 0, 0, 80, 20, 12, mint);
      const transform = this.labels.get(`dmg-${i}`)!.node.getComponent(UITransform)!;
      transform.setAnchorPoint(.5, .5);
      this.labels.get(`dmg-${i}`)!.node.active = false;
    }
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

  render(session: DiveSession, notice = '', ads?: DiveAdView, state?: LocalState): void {
    const s = session.snapshot, l = this.layout, g = this.chrome;
    const b = session.battle;
    if (this.currentSession !== session) { this.projection.x = b.player.x; this.projection.y = b.player.y; this.currentSession = session; }
    this.projection.alpha = session.renderAlpha;
    const player = b.samplePlayer(this.projection.alpha);
    this.projection.follow(player.x, player.y, l.height);
    this.sea.render(session, this.projection);
    this.drawWorld(session);
    g.clear();
    this.box(g, { x: l.left + 10, y: l.top + 6, width: 355 - l.left - l.right, height: 58 }, new Color(5, 27, 40, 182), 10);
    const oxygenColor = s.oxygen / s.oxygenCapacity < 0.15 ? danger : mint;
    this.box(g, { x: l.oxygen.x, y: l.oxygen.y + 21, width: l.oxygen.width, height: 3 }, line, 1);
    this.box(g, { x: l.oxygen.x, y: l.oxygen.y + 21, width: l.oxygen.width * s.oxygen / s.oxygenCapacity, height: 3 }, oxygenColor, 1);
    this.box(g, { x: 195-l.right, y:l.top+33, width:158, height:3 }, line, 1);
    this.box(g, { x: 195-l.right, y:l.top+33, width:158*Math.max(0,s.hp/s.maxHp), height:3 }, s.hp/s.maxHp < .3 ? danger : mint, 1);
    this.set('oxygenGauge', `O₂  ${Math.ceil(s.oxygen / s.oxygenCapacity * 100)}%`);
    this.set('cargo', `舱  ${Math.floor(s.cargo.crystal)} / ${s.cargoCapacity}`);
    this.set('hp', `生命  ${Math.ceil(s.hp)}/${s.maxHp}`);
    this.set('depth', `${Math.floor(s.depth)} m ↓`);
    const boss = Array.from(session.battle.enemies.values()).find(enemy => enemy.kind === 'boss');
    const status = s.oxygen <= 0 ? '氧气耗尽 · 正在失血，立即返航 ↑' : s.oxygen/s.oxygenCapacity < .15 ? '低氧警报 · 补给或安全返航 ↑' : s.cargo.crystal >= s.cargoCapacity ? '舱已满 · 返航保住收获 ↑' : boss ? `${boss.name} · ${Math.ceil(boss.hp)}/${Math.ceil(boss.maxHp)}` : '';
    if (status) this.box(g, l.status, new Color(5,27,40,190), 7);
    this.set('status', status);
    for (const r of [l.pause, l.return, l.sonar]) this.box(g, r, panel, 10);
    const seconds = ads?.sonarSeconds ?? 0;
    this.set('sonar', seconds ? `声呐 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} ${b.movementMode === 'manual' ? '手动' : seconds <= 60 ? '刷新' : '自动'}` : '声呐 · 补给');
    this.buttons.get('sonar')!.interactable = s.state === 'Running' && !session.pause.paused && !!ads?.sonarRefreshable;
    this.oxygenCard.active = !!ads?.oxygenPrompt && s.state === 'Running' && !session.pause.paused;
    const tutorial = state ? tutorialHint(state, s.activeSeconds) : '';
    const tasks = state ? objectiveTasks(state) : [], task = tasks.find(t => t.kind === 'first-day');
    const hint = tutorial ? tutorial + (s.activeSeconds < 6 ? '\n岩礁阻挡通路 · 红色斜纹危险区会伤害你' : '') : s.activeSeconds < 6 ? '拖动空白处游动 · 自动攻击\n岩礁阻挡通路 · 红色斜纹危险区会伤害你' : task?.ready ? '任务已完成 · 返港领取奖励' : '';
    if (hint !== this.hintKey) { this.hintKey = hint; this.hintUntil = s.activeSeconds + 7; }
    const guidance = s.state === 'Running' && !status && !this.oxygenCard.active && !session.pause.paused && s.activeSeconds < this.hintUntil ? hint : '';
    if (guidance) this.box(g, { x:l.left+10, y:l.top+94, width:355-l.left-l.right, height:44 }, new Color(5,27,40,165), 8);
    this.set('guidance', guidance);
    this.set('oxygenBody', `应急供氧 · 今日剩余 ${ads?.oxygenRemaining ?? 0}/3\n空白处仍可拖动，返航始终可用`);
    this.buttons.get('oxygen')!.interactable = (ads?.oxygenRemaining ?? 0) > 0;
    this.set('feedback', s.state === 'Running' && !session.pause.paused ? notice : '');
    g.strokeColor = line; g.lineWidth = 1;
    g.moveTo(l.rail.x - 187.5, l.height / 2 - l.rail.y); g.lineTo(l.rail.x - 187.5, l.height / 2 - l.rail.y - l.rail.height); g.stroke();
    for (let d = 0; d <= 2400; d += 400) {
      const y = l.height / 2 - l.rail.y - d / 2400 * l.rail.height;
      g.moveTo(l.rail.x - 187.5, y); g.lineTo(l.rail.x - 183.5, y); g.stroke();
    }
    this.dot(g, l.rail.x, l.rail.y + Math.min(1, s.depth / 2400) * l.rail.height, 4, mint);
    if (this.joystick) {
      const {origin,tip} = this.joystick, dx=tip.x-origin.x, dy=tip.y-origin.y, length=Math.hypot(dx,dy), k=length>50 ? 50/length : 1;
      g.strokeColor = new Color(155,245,224,135); g.lineWidth=1.5;
      g.circle(origin.x-187.5,l.height/2-origin.y,50); g.stroke();
      this.dot(g,origin.x+dx*k,origin.y+dy*k,14,new Color(105,233,198,135));
    }
    let settlementNotice = notice;
    const first = state?.objectives.tutorial.diveId === session.diveId && state.objectives.tutorial.rewarded && state.events.some(e => e.name === 'deposit_done' && e.properties.dive_id === session.diveId && e.properties.tutorial_reward);
    if (s.state === 'Settled' && first) {
      if (!this.depositStarted) this.depositStarted = Date.now();
      const value = Math.min(500, Math.floor(500 * (Date.now() - this.depositStarted) / 700));
      settlementNotice = notice || `首次入账  +${value} 荧晶\n教学统一奖励 500，替代本局荧晶拾取。\n返回母港强化舱容或氧效，再次出发。`;
    }
    this.drawModal(session, settlementNotice, ads);
  }

  destroy(): void { this.sea.destroy(); if (isValid(this.root, true)) this.root.destroy(); }

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
    if (session.pause.has('assets')) {
      title = this.sea.status === 'error' ? '海域连接未完成' : '正在进入海域';
      body = this.sea.status === 'error' ? '素材暂未加载成功。\n现场与收获已冻结，可重试。' : '正在准备场景与生物…\n氧气、战斗与收获保持冻结。';
      primary = this.sea.status === 'error' ? '重新加载海域' : '正在加载…'; secondary = '';
    }
    if (ads?.rewardPending) { title = '奖励确认中'; body = notice || '现场保持冻结，重试原奖励即可。\n无需再次观看视频。'; primary = '重试原奖励'; secondary = ''; }
    else if (ads?.busy) { title = '等待补给'; body = notice || '战斗与氧耗已冻结。'; primary = '正在加载或播放…'; secondary = ''; }
    this.set('modalTitle', title); this.set('modalBody', body); this.set('primary', primary); this.set('secondary', secondary);
    this.box(g, l.primary, new Color(32, 83, 80), 9);
    if (secondary) this.box(g, l.secondary, ink, 9);
    this.labels.get('secondary')!.node.active = !!secondary;
    const blocked = session.pause.has('ad') || session.pause.has('background') || session.pause.has('reconnect');
    const actionable = !blocked && (s.state === 'Settled' || s.state === 'RescuePending' || (s.state === 'Running' && session.pause.has('modal')));
    this.buttons.get('primary')!.interactable = ads?.rewardPending ? !ads.busy && !session.pause.has('background') && !session.pause.has('reconnect') : session.pause.has('assets') ? !blocked && this.sea.status === 'error' : actionable && !(s.state === 'RescuePending' && (ads?.rescueRemaining ?? 3) === 0);
    this.buttons.get('secondary')!.interactable = actionable && !!secondary && !ads?.rewardPending;
  }

  private drawWorld(session: DiveSession): void {
    const g = this.world, l = this.layout, b = session.battle; g.clear();
    const point = (item: { x: number; y: number }) => this.projection.point(item.x,item.y);
    for (const zone of b.dangerZones) {
      const p=point(zone), x=p.x-187.5, y=l.height/2-p.y, r=zone.radius;
      this.dot(g,p.x,p.y,r,new Color(123,34,49,55));
      g.strokeColor=new Color(255,117,118,200); g.lineWidth=1.5; g.circle(x,y,r); g.stroke();
      // Parallel hazard hatching stays inside the real circular damage footprint.
      g.strokeColor=new Color(255,117,118,100);
      for (let offset=-r+8;offset<r;offset+=14) {
        const half=Math.sqrt(r*r-offset*offset), d=Math.SQRT1_2;
        g.moveTo(x+(offset-half)*d,y+(offset+half)*d); g.lineTo(x+(offset+half)*d,y+(offset-half)*d);
      }
      g.stroke(); this.segment(g,p.x,p.y-9,p.x,p.y+3,danger,3); this.dot(g,p.x,p.y+10,2,danger);
    }
    for (const o of b.obstacles) {
      const p=point(o), r=o.radius, x=p.x-187.5, y=l.height/2-p.y;
      // 32 boundary facets approximate the unchanged solid circle to <0.3px at r=46.
      g.fillColor=new Color(46,76,81); g.strokeColor=new Color(126,170,157); g.lineWidth=1.5;
      for(let i=0;i<32;i++){ const a=i*Math.PI/16; const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r; if(!i)g.moveTo(px,py);else g.lineTo(px,py); }
      g.close(); g.fill(); g.stroke();
      g.fillColor=new Color(71,105,105); g.moveTo(x-r*.8,y+r*.35); g.lineTo(x-r*.2,y+r*.8); g.lineTo(x+r*.5,y+r*.5); g.lineTo(x+r*.15,y-r*.25); g.close();g.fill();
      g.strokeColor=new Color(28,53,62);g.lineWidth=2;
      g.moveTo(x-r*.4,y-r*.55);g.lineTo(x+r*.15,y-r*.25);g.lineTo(x+r*.65,y-r*.5);g.stroke();
      this.segment(g,p.x-r*.38,p.y-r*.25,p.x-r*.2,p.y-r*.65,mint,2);
    }
    for (const e of b.loot.values()) { const p=this.projection.sample(e); this.dot(g,p.x,p.y,3,mint); }
    for (const e of b.projectiles.values()) {
      const p=this.projection.sample(e);
      if (e.kind==='torpedo') {
        const speed=Math.hypot(e.vx,e.vy)||1, dx=e.vx/speed,dy=e.vy/speed;
        if(!this.lowEnd) this.segment(g,p.x-dx*18,p.y-dy*18,p.x-dx*5,p.y-dy*5,new Color(105,233,198,100),2);
        this.segment(g,p.x-dx*5,p.y-dy*5,p.x+dx*5,p.y+dy*5,cream,3);
        this.segment(g,p.x-dx*3-dy*3,p.y-dy*3+dx*3,p.x-dx*5,p.y-dy*5,mint,1.5);
        this.segment(g,p.x-dx*3+dy*3,p.y-dy*3-dx*3,p.x-dx*5,p.y-dy*5,mint,1.5);
      } else if(e.kind==='mine') {
        this.dot(g,p.x,p.y,6,amber);
        for(let i=0;i<3;i++){const a=i*Math.PI*2/3;this.segment(g,p.x+Math.cos(a)*6,p.y+Math.sin(a)*6,p.x+Math.cos(a)*10,p.y+Math.sin(a)*10,amber,2);}
      } else {
        g.strokeColor=new Color(105,233,198,this.lowEnd?170:125);g.lineWidth=2;
        g.circle(p.x-187.5,l.height/2-p.y,e.radius);g.stroke();
        if(!this.lowEnd && e.radius>10){g.strokeColor=new Color(180,255,236,65);g.lineWidth=1;g.circle(p.x-187.5,l.height/2-p.y,e.radius-5);g.stroke();}
      }
    }
    for (const e of b.effects.values()) {
      const p=point(e),end=point({x:e.endX,y:e.endY});
      if(e.kind==='mine') { g.strokeColor=amber;g.lineWidth=2;g.circle(p.x-187.5,l.height/2-p.y,e.radius);g.stroke(); }
      else if(e.kind==='arc') {
        const mx=(p.x+end.x)/2,my=(p.y+end.y)/2;
        this.segment(g,p.x,p.y,mx+4,my-4,new Color(165,203,255,190),this.lowEnd?1.5:2.5);
        this.segment(g,mx+4,my-4,end.x,end.y,new Color(165,203,255,190),this.lowEnd?1.5:2.5);
      }
    }
    // Existing text pool is also a bounded impact source, including in low quality.
    for(const t of b.texts.values()) if(t.expiresTick-b.tick>=15) {
      const p=this.projection.sample(t), age=20-(t.expiresTick-b.tick), r=3+age;
      this.segment(g,p.x-r,p.y,p.x+r,p.y,cream,1.5);
      this.segment(g,p.x,p.y-r,p.x,p.y+r,amber,1.5);
    }
    this.drawTexts(session);
    const gate = session.content.gateDepth;
    if (gate !== undefined && Math.abs(gate - session.depth) < 240) {
      const y = l.height/2-point({x:0,y:gate}).y;
      g.strokeColor = amber; g.lineWidth = 2; g.moveTo(-145, y); g.lineTo(110, y); g.stroke();
    }
    if (session.content.openRifts.length) {
      g.strokeColor = mint; g.lineWidth = 2;
      const previous = session.depth < 1600 ? 800 : 1600, distance = previous - session.depth, p=point({x:0,y:previous});
      if (Math.abs(distance) < 240) { g.ellipse(p.x-187.5,l.height/2-p.y,32,8);g.stroke(); }
    }
  }

  /** Damage numbers ride the battle's own text pool; low-end devices skip them entirely. */
  private drawTexts(session: DiveSession): void {
    if (this.lowEnd) return;
    const b = session.battle, l = this.layout;
    let shown = 0;
    for (const t of b.texts.values()) {
      if (shown >= TEXT_POOL) break;
      const label = this.labels.get(`dmg-${shown}`)!, node = label.node;
      node.active = true;
      const p=this.projection.sample(t); node.setPosition(p.x-187.5,l.height/2-p.y);
      const value = String(Math.round(t.value));
      if (label.string !== value) label.string = value;
      shown++;
    }
    for (; shown < TEXT_POOL; shown++) this.labels.get(`dmg-${shown}`)!.node.active = false;
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
  private segment(g: Graphics,x1:number,y1:number,x2:number,y2:number,color:Color,width:number): void {
    g.strokeColor=color;g.lineWidth=width;g.moveTo(x1-187.5,this.layout.height/2-y1);g.lineTo(x2-187.5,this.layout.height/2-y2);g.stroke();
  }
}
