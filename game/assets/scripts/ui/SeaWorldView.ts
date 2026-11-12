import { assetManager, AssetManager, SpriteFrame, Sprite, Node, UITransform, Layers, Rect, Size, Vec2, Graphics, Color, isValid } from 'cc';
import type { DiveSession } from '../battle/DiveSession';
import { SEA_BANDS, WORLD_BOUNDS, bandBlend, layerAtDepth, residentLayersAt } from '../battle/SeaContent';
import type { SeaLayer } from '../battle/SeaContent';
import { STEP_SECONDS } from '../battle/model';
import type { Enemy } from '../battle/model';
import { SeaBundleLease } from './SeaBundleLease';
import { SEA_ART, SEA_SCENES, SEA_IDENTITIES, BOSS_RIGS, PLAYER_ART } from './SeaArt';
import { enemyArtKey } from './legacyEnemyArt';
import { frontTilt, facingMemory, isFrontFacing, updateFacing } from './EnemyFacing';
import type { FacingMemory } from './EnemyFacing';
import { LayerAnnouncer } from './LayerAnnouncer';
import type { WorldProjection } from './WorldProjection';
import { wallTiles } from './WorldScroll';

interface LoadedArt { bundle: AssetManager.Bundle; frames: Map<string, SpriteFrame>; sequences: Map<string, SpriteFrame[]> }
/** `art` mirrors only the creature (body, fins, tentacle sockets); the vitality bar lives on
 *  `node`, outside the mirrored transform, so hp fills always deplete toward the same side. */
interface Actor { node: Node; sprite: Sprite; art: Node; key: string; parts: Node[]; bar?: Graphics; facing?: FacingMemory }
interface LayerStrips { far: Node[]; flora?: Node }

const siltTint: Readonly<Record<SeaLayer, Color>> = {
  sunlight: new Color(140, 205, 215),
  twilight: new Color(96, 130, 170),
  abyss: new Color(70, 88, 132),
};

/** Art is leased independently from combat. No timers advance while battle is paused. */
export class SeaWorldView {
  readonly root: Node;
  readonly leases: SeaBundleLease<LoadedArt>;
  private background: Node;
  private actorsRoot: Node;
  private actors = new Map<number, Actor>();
  private sceneLayer?: SeaLayer;
  private common?: LoadedArt;
  private commonState: 'loading' | 'ready' | 'error' = 'loading';
  private player?: Actor;
  private dead = false;
  private facing: 1 | -1 = 1;
  private height = 812;
  private current?: SeaLayer;
  private snow?: Graphics;
  private boundary?: Graphics;
  private silt: Node[] = [];
  private transition?: Graphics;
  private scenery: { nodes: Node[]; rate: number; span: number; x: number; offsetY: number; mirror: boolean }[] = [];
  private strips = new Map<SeaLayer, LayerStrips>();
  private readonly announcer = new LayerAnnouncer();
  /** Seam-safe degraded state: set while a neighbouring band layer is still loading or failed. */
  private degraded?: { depth: number; state: 'loading' | 'error' };
  private boundaryNotice = '';
  private hintUntilTick = Number.NEGATIVE_INFINITY;
  private nextHintTick = Number.NEGATIVE_INFINITY;
  private readonly snowDots = Array.from({ length: 28 }, (_, i) => {
    const phase = (i * 97) % 211 / 211, drift = (i * 53) % 89 / 89;
    return { x: (phase - .5) * 420, speed: 14 + drift * 22, size: .8 + (i % 3) * .35, wobble: 6 + drift * 10 };
  });
  private readonly siltDots = Array.from({ length: 12 }, (_, i) => ({ phase: (i * 61) % 197 / 197, drift: (i * 37) % 71 / 71 }));
  constructor(parent: Node, private readonly lowEnd = false) {
    this.root = this.node('SeaWorld', parent);
    this.background = this.node('SeaBackground', this.root);
    if (!lowEnd) this.buildSnow();
    this.actorsRoot = this.node('SeaActors', this.root);
    this.leases = new SeaBundleLease(layer => this.load(layer), value => this.release(value), layer => this.removeLayer(layer));
    void this.loadCommon();
  }
  private buildSnow(): void {
    this.snow = this.node('MarineSnow', this.root).addComponent(Graphics);
    // Suspended matter drifts between the backdrop and the actors.
    this.snow.node.setSiblingIndex(1);
  }
  get status(): 'loading' | 'ready' | 'error' {
    if (this.commonState === 'error' || this.current && this.leases.state(this.current) === 'error') return 'error';
    return this.common && this.current && this.leases.get(this.current) ? 'ready' : 'loading';
  }
  get residentLayers(): string[] { return (['sunlight', 'twilight', 'abyss'] as const).filter(layer => !!this.leases.get(layer)); }
  get activeLayer(): SeaLayer | undefined { return this.current; }
  /** Dive-bundle frames for the shared projectile/FX layer (LOO-70 §1). */
  get fxFrames(): ReadonlyMap<string, SpriteFrame> | undefined { return this.commonState === 'ready' && this.common ? this.common.frames : undefined; }
  /** Seam-safe crossing state for the HUD: a band whose far side is not decoded yet. */
  get degradedBand(): { depth: number; state: 'loading' | 'error' } | undefined { return this.degraded; }
  get boundaryHint(): string { return this.boundaryNotice; }
  get layerPlate(): { text: string; alpha: number } | undefined { return this.announcer.visible ? { text: this.announcer.label, alpha: this.announcer.alpha } : undefined; }
  prepare(session: DiveSession): void {
    const depth = session.depth;
    // A living gate guardian still belongs to the preceding sea at exactly 800/1600m.
    const guardian = Array.from(session.battle.enemies.values()).find(e => e.kind === 'boss' && depth === session.content.gateDepth);
    this.current = guardian?.layer ?? layerAtDepth(depth);
    // Depth-threshold residency: preloads 240m ahead of each band, keeps both sides of a
    // band resident plus a 120m hysteresis, and never evicts on a direction flip (LOO-70 §3).
    const wanted = new Set(residentLayersAt(depth)); wanted.add(this.current!);
    this.leases.select(this.current!, wanted);
    // Only the current layer can pause the session: entering an area whose art is missing.
    // Crossing into a resident neighbour stays seamless; if that neighbour is still loading
    // the band barrier below pins the player instead of freezing oxygen and combat.
    if (session.state === 'Running' && this.status !== 'ready') session.pause.add('assets');
    else session.pause.remove('assets');
    this.updateBandBarrier(session, depth);
  }
  /** Seam-safe degraded path: pin depth to the band edge while the far side is not ready. */
  private updateBandBarrier(session: DiveSession, depth: number): void {
    const layer = layerAtDepth(depth);
    const wanted = new Set(residentLayersAt(depth));
    let barrier: { depth: number; state: 'loading' | 'error' } | undefined;
    for (const band of SEA_BANDS) {
      const farSide: SeaLayer = layer === band.lower ? band.upper : layer === band.upper ? band.lower : band.upper;
      const inside = layer === band.lower || layer === band.upper;
      // Only the band whose far side this depth actually preloads can block the diver;
      // the other boundary is hundreds of metres away and legitimately unloaded. The line
      // only arms within 120m of the band, so ordinary preloading never raises a notice.
      const near = layer === band.lower ? depth >= band.lo - 120 : depth <= band.hi + 120;
      if (!inside || !near || !wanted.has(farSide)) continue;
      if (this.leases.state(farSide) === 'ready') continue;
      if (layer === band.lower) session.battle.barrierDown = band.lo;
      else session.battle.barrierUp = band.hi;
      barrier = { depth: layer === band.lower ? band.lo : band.hi, state: this.leases.state(farSide) === 'error' ? 'error' : 'loading' };
    }
    if (!barrier) { session.battle.barrierDown = undefined; session.battle.barrierUp = undefined; }
    this.degraded = barrier;
  }
  retry(): void { this.leases.retry(); if (this.commonState === 'error') void this.loadCommon(); }
  resize(width: number, height: number): void {
    this.height = height;
    this.root.setScale(width / 375, width / 375, 1);
    this.root.getComponent(UITransform)!.setContentSize(375, height);
    // Re-layout backgrounds on viewport changes without reloading textures.
    this.clear(this.background); this.scenery = []; this.strips.clear(); this.sceneLayer = undefined;
  }
  render(session: DiveSession, projection?: WorldProjection): void {
    if (this.dead) return;
    this.prepare(session);
    const layer = this.current!, b = session.battle, depth = session.depth;
    const residents = residentLayersAt(depth);
    if (residents.indexOf(layer) < 0) residents.push(layer);
    for (const resident of new Set(residents)) {
      const art = this.leases.get(resident);
      if (art && !this.strips.has(resident)) this.buildLayerStrips(resident, art);
    }
    this.applyBlend(depth, b.tick, projection?.y ?? b.player.y);
    const cy = this.height * .46, alive = new Set<number>();
    const point = (item: { x: number; y: number; previousX?: number; previousY?: number }): [number, number] => {
      const p=projection?.sample(item) ?? {x:187.5+item.x-b.player.x,y:cy+item.y-b.player.y};
      return [p.x-187.5,this.height/2-p.y];
    };
    for (const enemy of b.enemies.values()) {
      const key = enemyArtKey(enemy, layer, SEA_IDENTITIES);
      if (!key) continue;
      const identity = SEA_IDENTITIES[key];
      if (!identity) throw new Error(`Unmapped enemy ${key}`);
      const art = this.leases.get(identity.layer);
      if (!art) continue;
      alive.add(enemy.id);
      let actor = this.actors.get(enemy.id);
      if (actor?.key !== key) { actor?.node.destroy(); this.actors.delete(enemy.id); actor = undefined; }
      if (!actor) {
        const size = enemy.kind === 'boss' ? 180 : enemy.kind === 'elite' ? 68 : 48;
        // Spawn heading follows the horizontal offset to the player (LOO-70 §5).
        actor = this.actor(key, identity.swim ?? identity.idle, size, art, facingMemory(b.player.x - enemy.x));
        if (enemy.kind !== 'normal') actor.bar = this.node('Vitality', actor.node).addComponent(Graphics);
        this.actors.set(enemy.id, actor);
      }
      const position=point(enemy);actor.node.setPosition(...position,0);
      actor.node.active=Math.abs(position[0])<260 && Math.abs(position[1])<this.height/2+100;
      const sequence = art.sequences.get(identity.swim ?? '');
      if (sequence) actor.sprite.spriteFrame = sequence[this.lowEnd ? 0 : Math.floor(b.tick / 5) % 4];
      this.applyHeading(actor, enemy, b.tick);
      const rig = BOSS_RIGS[key];
      if (rig) actor.parts.forEach((part, i) => { part.angle = rig.angles[i] + Math.sin(b.tick / 30 * Math.PI * 1.5) * 12; });
      if (actor.bar) {
        const g = actor.bar, w = enemy.kind === 'boss' ? 90 : 42, y = enemy.kind === 'boss' ? 80 : 35;
        g.clear(); g.fillColor = new Color(5, 24, 35, 220); g.roundRect(-w / 2, y, w, 4, 2); g.fill();
        g.fillColor = enemy.kind === 'boss' ? new Color(255, 151, 130) : new Color(187, 157, 244);
        g.rect(-w / 2, y, w * Math.max(0, Math.min(1, enemy.hp / enemy.maxHp)), 4); g.fill();
      }
    }
    for (const [id, actor] of this.actors) if (!alive.has(id)) { actor.node.destroy(); this.actors.delete(id); }
    if (this.common && !this.player) this.player = this.actor('player', PLAYER_ART, 60, this.common);
    if (this.player) {
      const dx=b.player.x-(b.player.previousX??b.player.x),dy=b.player.y-(b.player.previousY??b.player.y);
      const moving=Math.hypot(dx,dy)>.01, position=point(b.player);
      // Heading follows real displacement, so collision stops swimming and idle does not jitter.
      if(Math.abs(dx)>.01)this.facing=dx>0?1:-1;
      this.player.node.setPosition(position[0],position[1],0);
      this.player.node.setScale((this.facing??1)*(moving&&!this.lowEnd?1+Math.sin(b.tick*.7)*.025:1),1,1);
      this.player.node.angle=moving ? -Math.sign(dy)*8*(this.facing??1) : 0;
    }
    this.renderSnow(b, cy, projection);
    this.renderBoundary(b, projection);
    this.scrollScene(projection?.y ?? b.player.y);
    this.announcer.update(depth, b.tick);
  }
  /** LOO-70 §5: mirror the art container by real velocity; radial identities lean instead. */
  private applyHeading(actor: Actor, enemy: Enemy, tick: number): void {
    const vx = (enemy.x - enemy.previousX) / STEP_SECONDS;
    if (isFrontFacing(enemy.assetKey)) {
      actor.art.setScale(1, 1, 1);
      actor.art.angle = this.lowEnd ? 0 : frontTilt(vx);
    } else if (actor.facing) {
      actor.art.setScale(updateFacing(actor.facing, vx, tick), 1, 1);
      actor.art.angle = 0;
    }
  }
  private buildLayerStrips(layer: SeaLayer, art: LoadedArt): void {
    const scene = SEA_SCENES[layer]; if (!scene) return;
    const span = Math.max(812, this.height);
    const group: LayerStrips = { far: [] };
    for (let i = 0; i < 3; i++) group.far.push(this.sprite(`${layer}-far-${i}`, this.background, art.frames.get(scene.far)!, 375, span + 2).node);
    this.scenery.push({ nodes: group.far, rate: .18, span, x: 0, offsetY: 0, mirror: true });
    if (scene.flora) {
      const flora = this.sprite(`${layer}-flora`, this.background, art.frames.get(scene.flora)!, 120, 120);
      flora.node.setPosition(-136, -span / 2 + 200, 0);
      this.scenery.push({ nodes: [flora.node], rate: .78, span, x: -136, offsetY: -span / 2 + 200, mirror: false });
      group.flora = flora.node;
    }
    this.strips.set(layer, group);
  }
  /** Depth-linear dual-background blend (LOO-70 §3): weights follow real depth and reverse
   *  along the same path; outside a band only the current layer draws. */
  private applyBlend(depth: number, tick: number, cameraY: number): void {
    const blend = bandBlend(depth);
    const weights = new Map<SeaLayer, number>();
    if (blend) { weights.set(blend.band.lower, 1 - blend.weight); weights.set(blend.band.upper, blend.weight); }
    else if (this.current) weights.set(this.current, 1);
    for (const [layer, group] of this.strips) {
      const alpha = weights.get(layer) ?? 0;
      for (const node of group.flora ? [...group.far, group.flora] : group.far) {
        node.active = alpha > .002;
        if (node.active) node.getComponent(Sprite)!.color = new Color(255, 255, 255, Math.round(alpha * 255));
      }
    }
    this.renderSilt(blend ? 1 - Math.abs(blend.weight * 2 - 1) : 0, blend?.band.upper ?? this.current ?? 'sunlight', tick, cameraY);
  }
  /** Transition silt: two screen-wide sheets with opposing drift plus ≤12 rising motes,
   *  only inside a band, alpha ≤ 0.22 (LOO-70 §3 asset spec). */
  private renderSilt(activity: number, layer: SeaLayer, tick: number, cameraY: number): void {
    if (this.lowEnd || !this.common) return;
    if (!this.silt.length) {
      const frame = this.common.frames.get('loo70_transition_silt');
      if (!frame) return;
      for (let i = 0; i < 2; i++) this.silt.push(this.sprite(`transition-silt-${i}`, this.background, frame, 375, 220).node);
      this.transition = this.node('TransitionMotes', this.root).addComponent(Graphics);
      this.transition.node.setSiblingIndex(1);
    }
    const tint = siltTint[layer];
    this.silt.forEach((node, i) => {
      node.active = activity > .002;
      if (!node.active) return;
      const sprite = node.getComponent(Sprite)!;
      sprite.color = new Color(tint.r, tint.g, tint.b, Math.round(.22 * activity * 255));
      const cycle = this.height + 220;
      const drift = tick / 30 * (i ? 26 : -34) + cameraY * .35;
      node.setPosition(Math.sin(drift / 90) * 30, ((i * 173 + drift) % cycle + cycle) % cycle - cycle / 2, 0);
    });
    const g = this.transition;
    if (!g) return;
    g.clear();
    if (activity > .002) {
      g.fillColor = new Color(tint.r, tint.g, tint.b, Math.round(110 * activity));
      for (const dot of this.siltDots) {
        const cycle = this.height + 80;
        const rise = tick / 30 * (14 + dot.drift * 26) + cameraY * .5;
        const y = ((dot.phase * cycle + rise) % cycle + cycle) % cycle - cycle / 2;
        g.circle((dot.phase - .5) * 340 + Math.sin(tick / 26 + dot.phase * 9) * 10, y, 1.6 + dot.drift * 2.2);
      }
      g.fill();
    }
  }
  /** World-anchored sonar boundary at x=±540 (LOO-70 §2): a dashed line with a shaded
   *  exterior, brightening on approach, plus a once-per-second edge notice at the clamp. */
  private renderBoundary(b: DiveSession['battle'], projection?: WorldProjection): void {
    if (!this.boundary) {
      this.boundary = this.node('SeaBoundary', this.root).addComponent(Graphics);
      this.boundary.node.setSiblingIndex(this.lowEnd ? 1 : 2);
    }
    const g = this.boundary, cy = this.height * .46, cameraY = projection?.y ?? b.player.y;
    const px = projection?.x ?? b.player.x;
    const atLimit = Math.abs(b.player.x) >= WORLD_BOUNDS.maxX - b.player.radius - .5;
    const tick = b.tick;
    if (atLimit && tick >= this.nextHintTick) { this.hintUntilTick = tick + 30; this.nextHintTick = tick + 30; }
    this.boundaryNotice = tick < this.hintUntilTick ? '已到航区边缘' : '';
    g.clear();
    const near = Math.abs(px) >= WORLD_BOUNDS.maxX - 48;
    const alpha = near ? .55 : .25;
    for (const side of [-1, 1]) {
      const worldX = side * WORLD_BOUNDS.maxX;
      const p = projection ? projection.point(worldX, 0) : { x: 187.5 + worldX - px, y: cy };
      const sx = p.x - 187.5;
      if (sx < -24 || sx > 375 + 24) continue;
      // Shaded exterior band just outside the boundary.
      g.fillColor = new Color(2, 13, 21, Math.round(alpha * 140));
      g.rect(Math.min(sx, sx + side * 16), -this.height, 16, this.height * 3); g.fill();
      // Dashed sonar line; dash phase derives from world depth so it never swims.
      g.strokeColor = new Color(160, 190, 200, Math.round(alpha * 255)); g.lineWidth = 1;
      const span = this.height;
      for (let y = Math.floor((cameraY - span) / 14) * 14; y < cameraY + span; y += 14) {
        const sy = this.height / 2 - (cy + y - cameraY);
        if (sy < -12 || sy > this.height + 12) continue;
        g.moveTo(sx, sy); g.lineTo(sx, sy - 8);
      }
      g.stroke();
    }
    // Seam-safe crossing (LOO-70 §3): a buoyed temporary safety line at the band edge while
    // the neighbouring layer is still loading — the fight stays alive behind it.
    if (this.degraded) {
      const p = projection ? projection.point(0, this.degraded.depth) : { x: 187.5, y: cy + this.degraded.depth - (projection ? 0 : b.player.y) };
      const sy = this.height / 2 - p.y;
      if (sy > -20 && sy < this.height + 20) {
        const failed = this.degraded.state === 'error';
        g.strokeColor = new Color(255, 184, 99, failed ? 200 : 150); g.lineWidth = 1.5;
        for (let x = -180; x < 180; x += 16) { g.moveTo(x, sy); g.lineTo(x + 9, sy); }
        g.stroke();
        g.fillColor = new Color(255, 184, 99, 220);
        for (const bx of [-170, 170]) { g.moveTo(bx, sy + 6); g.lineTo(bx + 7, sy); g.lineTo(bx, sy - 6); g.close(); }
        g.fill();
      }
    }
  }
  /** Decorative suspended matter: pure presentation, safe to drop on low-end devices. */
  private renderSnow(b: DiveSession['battle'], cy: number, projection?: WorldProjection): void {
    if (!this.snow) return;
    const g = this.snow; g.clear(); g.fillColor = new Color(190, 224, 234, 88);
    const span = this.height + 300;
    // Rises on screen while diving: screenY = phase - cy, phase grows with tick and depth.
    for (let i = 0; i < this.snowDots.length; i++) {
      const dot = this.snowDots[i], phase = (b.tick/30 * dot.speed + i * span / this.snowDots.length + (projection?.y??b.player.y) * .12) % span;
      const x = dot.x + Math.sin(b.tick / 40 + i) * dot.wobble - (projection?.x??b.player.x) * .25;
      g.circle(x - 7.5, phase - cy, dot.size);
    }
    g.fill();
  }
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.clear(this.actorsRoot); this.player = undefined; this.actors.clear(); this.clear(this.background);
    this.strips.clear(); this.silt = []; this.scenery = [];
    this.leases.dispose(); if (this.common) this.release(this.common); this.common = undefined;
    if (isValid(this.root, true)) this.root.destroy();
  }
  private async loadCommon(): Promise<void> {
    this.commonState = 'loading';
    try { const loaded = await this.load('dive'); if (this.dead) this.release(loaded); else { this.common = loaded; this.commonState = 'ready'; } }
    catch { if (!this.dead) this.commonState = 'error'; }
  }
  private async load(name: string): Promise<LoadedArt> {
    const bundle = await new Promise<AssetManager.Bundle>((resolve, reject) => assetManager.loadBundle(name, (error, result) => error ? reject(error) : resolve(result)));
    let frames: SpriteFrame[];
    try {
      frames = await new Promise<SpriteFrame[]>((resolve, reject) => bundle.loadDir('content', SpriteFrame, (error, result) => error ? reject(error) : resolve(result)));
    } catch (error) {
      // A directory load may cache some assets before another file fails.
      // This checks reference counts and preserves frames owned by another view.
      // Creator 3.8.8 implements this refcount-aware cleanup but omits it from
      // public declarations (@engineInternal); the editor version is pinned.
      (bundle as AssetManager.Bundle & { releaseUnusedAssets(): void }).releaseUnusedAssets(); throw error;
    }
    const result: LoadedArt = { bundle, frames: new Map(), sequences: new Map() };
    const byName = new Map(frames.map(frame => [frame.name, frame]));
    try {
      for (const [key, spec] of Object.entries(SEA_ART)) if (spec.bundle === name) {
        const frame = byName.get(spec.path.split('/').pop()!);
        if (!frame) throw new Error(`Missing imported art ${name}/${key}`);
        frame.addRef(); result.frames.set(key, frame);
        if (spec.frames) result.sequences.set(key, spec.frames.map(([x, y, w, h]) => {
          const cut = new SpriteFrame(); cut.reset({ texture: frame.texture!, rect: new Rect(x, y, w, h), originalSize: new Size(w, h), offset: new Vec2(0, 0), isRotate: false });
          cut.addRef(); return cut;
        }));
      }
      return result;
    } catch (error) { this.release(result); throw error; }
  }
  private release(art: LoadedArt): void {
    for (const sequence of art.sequences.values()) sequence.forEach(frame => frame.decRef());
    art.sequences.clear(); art.frames.forEach(frame => frame.decRef()); art.frames.clear();
    // Bundle objects are globally cached. Drop only our addRefs: decRef automatically
    // releases unreferenced textures while another view's live references stay valid.
  }
  private removeLayer(layer: SeaLayer): void {
    for (const [id, actor] of this.actors) if (SEA_IDENTITIES[actor.key]?.layer === layer) {
      if (isValid(actor.node, true)) { actor.node.removeFromParent(); actor.node.destroy(); }
      this.actors.delete(id);
    }
    const strips = this.strips.get(layer);
    if (strips) {
      for (const node of strips.flora ? [...strips.far, strips.flora] : strips.far) {
        if (isValid(node, true)) { node.removeFromParent(); node.destroy(); }
      }
      this.scenery = this.scenery.filter(strip => !strips.far.includes(strip.nodes[0]) && strip.nodes[0] !== strips.flora);
      this.strips.delete(layer);
    }
    if (this.sceneLayer === layer) this.sceneLayer = undefined;
  }
  private scrollScene(cameraY: number): void {
    for (const strip of this.scenery) {
      const tiles = wallTiles(cameraY, strip.span, strip.rate);
      strip.nodes.forEach((node, i) => {
        node.setPosition(strip.x, tiles[i].y + strip.offsetY, 0);
        node.setScale(1, strip.mirror ? tiles[i].flip : 1, 1);
      });
    }
  }
  private actor(key: string, image: string, size: number, art: LoadedArt, facing?: FacingMemory): Actor {
    const frame = art.sequences.get(image)?.[0] ?? art.frames.get(image);
    if (!frame) throw new Error(`Missing actor ${image}`);
    const node = this.node(key, this.actorsRoot), artNode = this.node(`${key}-art`, node);
    // The outer node keeps the actor's full logical footprint for hit reads and tooling.
    node.getComponent(UITransform)!.setContentSize(size, size);
    const sprite = this.frameSprite(artNode, frame, size, size), parts: Node[] = [];
    const rig = BOSS_RIGS[key];
    if (rig) for (const angle of rig.angles) {
      const partFrame = art.frames.get(rig.partKey)!;
      const part = this.sprite(rig.partKey, artNode, partFrame, rig.sourcePartSize * size / rig.sourceBodySize * rig.scale, rig.sourcePartSize * size / rig.sourceBodySize * rig.scale);
      part.node.getComponent(UITransform)!.setAnchorPoint(rig.anchor[0], rig.anchor[1]);
      part.node.setPosition(rig.socket[0] * size / 768, rig.socket[1] * size / 768);
      part.node.angle = angle; parts.push(part.node);
    }
    return { node, sprite, art: artNode, key, parts, facing };
  }
  private sprite(name: string, parent: Node, frame: SpriteFrame, width: number, height: number): Sprite {
    const n = this.node(name, parent), s = this.frameSprite(n, frame, width, height); return s;
  }
  private frameSprite(parent: Node, frame: SpriteFrame, width: number, height: number): Sprite {
    const s = parent.addComponent(Sprite); s.spriteFrame = frame; s.sizeMode = Sprite.SizeMode.CUSTOM;
    parent.getComponent(UITransform)!.setContentSize(width, height); return s;
  }
  private node(name: string, parent: Node): Node { const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.addComponent(UITransform); return n; }
  private clear(n: Node): void {
    if (!isValid(n, true)) return;
    for (const child of [...n.children]) if (isValid(child, true)) { child.removeFromParent(); child.destroy(); }
  }
}
