import { Node, Sprite, SpriteFrame, UITransform, Layers, Rect, Size, Vec2, Graphics, Color } from 'cc';
import type { Battle } from '../battle/Battle';
import type { Effect, Projectile } from '../battle/model';
import { STEP_SECONDS } from '../battle/model';

/** Design caps (LOO-70 §1): impacts are decoration and merge before they can crowd out
 *  real gameplay; wakes stay one-per-projectile (never particle chains). */
export const IMPACT_CAP = 24;
const IMPACT_FRAMES = 4;
const IMPACT_FPS = 24;
const IMPACT_TICKS = Math.ceil(IMPACT_FRAMES / IMPACT_FPS / STEP_SECONDS); // ≈5 ticks ≈167ms
const ARC_MAX_SEGMENTS = 6;
const ARC_SEGMENT_LENGTH = 42;
const TORPEDO_CORE = { w: 24, h: 12 };
const MINE_CORE = 28;

interface Visual { node: Node; sprite: Sprite }

/** Sprite-based weapon presentation over the battle pools. Everything is pooled per kind,
 *  keyed by pool id, and nothing here feeds back into combat: destruction of visuals or a
 *  full cap only drops decoration, never damage (LOO-70 §1). */
export class SeaFx {
  private readonly root: Node;
  private readonly glow: Graphics;
  private readonly pool = new Map<string, Visual[]>();
  private readonly live = new Map<string, Visual>();
  private readonly impacts: { node: Node; sprite: Sprite; bornTick: number }[] = [];
  private readonly seenProjectiles = new Set<number>();
  private readonly seenTexts = new Set<number>();
  private readonly seenEffects = new Set<number>();
  private impactFrames?: SpriteFrame[];
  private impactSource?: SpriteFrame;
  readonly lowEnd: boolean;

  constructor(parent: Node, private readonly frames: ReadonlyMap<string, SpriteFrame>, lowEnd = false) {
    this.lowEnd = lowEnd;
    this.root = new Node('SeaFx');
    this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root);
    this.root.addComponent(UITransform);
    this.glow = this.node('SeaFxGlow', this.root).addComponent(Graphics);
  }

  destroy(): void {
    this.live.forEach(visual => visual.node.destroy());
    this.live.clear();
    this.impacts.forEach(impact => impact.node.destroy());
    this.impacts.length = 0;
    this.pool.forEach(visuals => visuals.forEach(visual => visual.node.destroy()));
    this.pool.clear();
    if (this.impactSource) this.impactSource.decRef();
    this.impactSource = undefined;
    this.impactFrames = undefined;
    this.root.destroy();
  }

  /** Drives every visual from one battle snapshot. toScreen maps world units to the local
   *  logical space; callers pass previous coordinates too so 30Hz logic renders smoothly. */
  sync(b: Battle, toScreen: (x: number, y: number, px?: number, py?: number) => { x: number; y: number }, tick: number): void {
    this.glow.clear();
    const seen = new Set<number>();
    for (const p of b.projectiles.values()) {
      seen.add(p.id);
      if (!this.seenProjectiles.has(p.id)) this.seenProjectiles.add(p.id);
      this.projectileVisual(p, toScreen, tick);
    }
    for (const id of this.seenProjectiles) {
      if (seen.has(id)) continue;
      this.seenProjectiles.delete(id);
      for (const prefix of ['p', 'w', 's', 'm']) this.retire(`${prefix}${id}`);
      const last = this.lastPositions.get(`p${id}`);
      this.lastPositions.delete(`p${id}`);
      if (last && !this.lowEnd) this.impact(last.x, last.y, tick, new Color(115, 255, 240, 255));
    }
    const textSeen = new Set<number>();
    for (const t of b.texts.values()) {
      textSeen.add(t.id);
      if (this.seenTexts.has(t.id)) continue;
      this.seenTexts.add(t.id);
      const at = toScreen(t.x, t.y, t.previousX, t.previousY);
      this.impact(at.x, at.y, tick, new Color(255, 209, 132, 255));
    }
    for (const id of this.seenTexts) if (!textSeen.has(id)) this.seenTexts.delete(id);
    const effectSeen = new Set<number>();
    for (const e of b.effects.values()) {
      effectSeen.add(e.id);
      this.effectVisual(e, toScreen, tick);
    }
    for (const id of this.seenEffects) {
      if (effectSeen.has(id)) continue;
      this.seenEffects.delete(id);
      this.retire(`e${id}`);
      for (let segment = 1; segment <= ARC_MAX_SEGMENTS; segment++) this.retire(`e${id}:${segment}`);
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      const age = tick - impact.bornTick;
      if (age > IMPACT_TICKS) {
        this.impacts.splice(i, 1);
        this.recycle('impact', { node: impact.node, sprite: impact.sprite });
        continue;
      }
      impact.sprite.spriteFrame = this.impactFrames![Math.min(IMPACT_FRAMES - 1, Math.floor(age / STEP_SECONDS * IMPACT_FPS))];
    }
  }

  private readonly lastPositions = new Map<string, { x: number; y: number }>();

  private projectileVisual(p: Projectile, toScreen: (x: number, y: number, px?: number, py?: number) => { x: number; y: number }, tick: number): void {
    const at = toScreen(p.x, p.y, p.previousX, p.previousY);
    this.lastPositions.set(`p${p.id}`, at);
    if (p.kind === 'torpedo') {
      const core = this.acquire(`p${p.id}`, 'loo70_fx_torpedo', TORPEDO_CORE.w, TORPEDO_CORE.h);
      // toScreen flips world y (depth grows downward), so the rendered path mirrors the
      // world velocity's y component. atan2(p.vy, …) pointed descending shots upward.
      // `+ 0` normalises atan2's -0 for level flight.
      const angle = Math.atan2(-p.vy, p.vx) * 180 / Math.PI + 0;
      core.node.setPosition(at.x, at.y, 0);
      // The art heads right at 0°, so the CCW angle from the real velocity vector keeps
      // the nose on the flight path from spawn to expiry.
      core.node.angle = angle;
      if (!this.lowEnd) {
        const wake = this.acquire(`w${p.id}`, 'loo70_fx_wake', 30, 15, true);
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const stretch = Math.min(2.2, .8 + speed / 420);
        // The wake trails the screen-space path, so its y offset mirrors too.
        wake.node.setPosition(at.x - p.vx / speed * 16, at.y + p.vy / speed * 16, 0);
        wake.node.angle = angle;
        wake.node.setScale(stretch, 1, 1);
      }
    } else if (p.kind === 'mine') {
      const mine = this.acquire(`m${p.id}`, 'loo70_fx_mine', MINE_CORE, MINE_CORE);
      mine.node.setPosition(at.x, at.y, 0);
      mine.node.angle = 0;
      // Idle breathing; the final 200ms flushes amber before the blast (LOO-70 §1).
      const pulse = .92 + .08 * Math.sin(tick / 3.2);
      mine.node.setScale(pulse, pulse, 1);
      const remaining = p.expiresTick - tick;
      mine.sprite.color = remaining * STEP_SECONDS <= .2 ? new Color(255, 184, 99, 255) : new Color(255, 255, 255, 255);
    } else {
      const at2 = toScreen(p.x, p.y, p.previousX, p.previousY);
      const ring = this.acquire(`s${p.id}`, 'loo70_fx_sonar', 128, 128, true);
      // The halo previously kept its stale pooled position and read as a second ring
      // drifting off the live AOE; it must ride the sonar point every tick.
      ring.node.setPosition(at2.x, at2.y, 0);
      // The ring always equals the live AOE diameter; visuals never inflate the range.
      // The source stroke would scale to ~2.8px-per-10-radius, so the exact AOE edge is
      // drawn as a thin crisp circle and the art rides behind as a faint tick-mark halo.
      const diameter = Math.max(6, p.radius * 2);
      ring.node.setScale(diameter / 128, diameter / 128, 1);
      ring.sprite.color = new Color(115, 255, 240, 70);
      this.glow.strokeColor = new Color(115, 255, 240, 215);
      this.glow.lineWidth = 1.6;
      this.glow.circle(at2.x, at2.y, p.radius);
      this.glow.stroke();
    }
  }

  private effectVisual(e: Effect, toScreen: (x: number, y: number, px?: number, py?: number) => { x: number; y: number }, tick: number): void {
    const key = `e${e.id}`;
    this.seenEffects.add(e.id);
    if (e.kind === 'mine') {
      // Blast: one green ring plus at most 8 bubbles (LOO-70 §1).
      const at = toScreen(e.x, e.y, e.previousX, e.previousY);
      const age = Math.max(0, e.expiresTick - tick);
      const life = Math.max(1, e.radius / 70 * 8);
      const grow = Math.min(1, 1 - age / life);
      this.glow.strokeColor = new Color(150, 246, 186, Math.round(200 * grow));
      this.glow.lineWidth = 2;
      this.glow.circle(at.x, at.y, e.radius * (0.4 + 0.6 * grow));
      this.glow.stroke();
      this.glow.fillColor = new Color(190, 250, 214, Math.round(150 * grow));
      const bubbles = Math.min(8, Math.ceil(e.radius / 12));
      for (let i = 0; i < bubbles; i++) {
        const angle = i / bubbles * Math.PI * 2 + e.id;
        const distance = e.radius * grow * (.55 + (i % 3) * .2);
        this.glow.circle(at.x + Math.cos(angle) * distance, at.y + Math.sin(angle) * distance - (1 - grow) * 14, 2.4);
      }
      this.glow.fill();
      return;
    }
    if (e.kind !== 'arc') return;
    // Chain lightning: ≤6 shared arc segments from origin to the actual hit target, with a
    // deterministic 20ms-scale fold jitter. Segments bind to real endpoints only.
    const from = toScreen(e.x, e.y, e.previousX, e.previousY), to = toScreen(e.endX, e.endY, e.endX, e.endY);
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) { this.retire(key); return; }
    const segments = this.lowEnd ? 1 : Math.max(2, Math.min(ARC_MAX_SEGMENTS, Math.round(length / ARC_SEGMENT_LENGTH)));
    const nx = -dy / length, ny = dx / length;
    const flash = e.expiresTick - tick <= 3 ? 235 : 170;
    let previous = from;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const fold = i < segments ? (Math.sin(e.id * 12.9898 + i * 78.233 + Math.floor(tick / .6) * 3.7) * .5) * 10 : 0;
      const next = { x: from.x + dx * t + nx * fold, y: from.y + dy * t + ny * fold };
      const segment = this.acquire(`${key}:${i}`, 'loo70_fx_arc', Math.hypot(next.x - previous.x, next.y - previous.y), 10, true);
      segment.node.setPosition((previous.x + next.x) / 2, (previous.y + next.y) / 2, 0);
      segment.node.angle = Math.atan2(next.y - previous.y, next.x - previous.x) * 180 / Math.PI;
      segment.sprite.color = new Color(180, 230, 255, flash);
      for (let j = i + 1; j <= ARC_MAX_SEGMENTS; j++) this.retire(`${key}:${j}`);
      previous = next;
    }
  }

  private impact(x: number, y: number, tick: number, tint: Color): void {
    if (this.lowEnd) return;
    if (!this.impactFrames) {
      const source = this.frames.get('loo70_fx_impact');
      if (!source) return;
      source.addRef();
      this.impactSource = source;
      this.impactFrames = [0, 1, 2, 3].map(i => {
        const cut = new SpriteFrame();
        cut.reset({ texture: source.texture!, rect: new Rect(i * 64, 0, 64, 64), originalSize: new Size(64, 64), offset: new Vec2(0, 0), isRotate: false });
        return cut;
      });
    }
    if (this.impacts.length >= IMPACT_CAP) {
      // Recycle the oldest burst: decoration merges, hits do not.
      const oldest = this.impacts.shift()!;
      this.recycle('impact', { node: oldest.node, sprite: oldest.sprite });
    }
    const visual = this.acquireVisual('impact', this.impactFrames[0], 48, 48, true);
    visual.node.setPosition(x, y, 0);
    visual.sprite.color = tint;
    this.impacts.push({ node: visual.node, sprite: visual.sprite, bornTick: tick });
  }

  private acquire(key: string, frameKey: string, width: number, height: number, additive = false): Visual {
    let visual = this.live.get(key);
    if (visual) return visual;
    const frame = this.frames.get(frameKey);
    if (!frame) throw new Error(`Missing FX art ${frameKey}`);
    visual = this.acquireVisual(frameKey, frame, width, height, additive);
    this.live.set(key, visual);
    return visual;
  }

  private acquireVisual(kind: string, frame: SpriteFrame, width: number, height: number, additive: boolean): Visual {
    const pooled = this.pool.get(kind);
    if (pooled?.length) {
      const visual = pooled.pop()!;
      visual.node.active = true;
      visual.sprite.spriteFrame = frame;
      return visual;
    }
    const node = this.node(`${kind}-${this.serial++}`, this.root);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    // Re-apply the size after the frame: the Sprite initialiser resets the node to the
    // texture's native pixels, which used to render torpedoes at 64x32 and mines at 64x64.
    node.getComponent(UITransform)!.setContentSize(width, height);
    if (additive) this.makeAdditive(sprite);
    return { node, sprite };
  }

  private retire(key: string): void {
    const visual = this.live.get(key);
    if (!visual) return;
    this.live.delete(key);
    this.recycle(visual.node.name.split('-').slice(0, -1).join('-'), visual);
  }

  private recycle(kind: string, visual: Visual): void {
    visual.node.active = false;
    let pool = this.pool.get(kind);
    if (!pool) { pool = []; this.pool.set(kind, pool); }
    pool.push(visual);
  }

  private serial = 0;

  private node(name: string, parent: Node): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }

  /** Shared additive blend state: one renderer state, no per-sprite materials, so batching
   *  is preserved. Engine blend factors: ZERO=0 ONE=1 SRC_ALPHA=2. */
  private makeAdditive(sprite: Sprite): void {
    try {
      type BlendTarget = { blendSrc: number; blendDst: number; blendSrcAlpha: number; blendDstAlpha: number };
      const state = (sprite as Sprite & { blendState?: { targets: BlendTarget[] } }).blendState;
      if (!state?.targets?.length) return;
      const target = state.targets[0];
      target.blendSrc = 1; target.blendDst = 1;
      target.blendSrcAlpha = 2; target.blendDstAlpha = 1;
    } catch { /* older engines keep normal alpha blending; the art still reads correctly */ }
  }
}
