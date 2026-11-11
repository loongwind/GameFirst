import { assetManager, AssetManager, SpriteFrame, Sprite, Node, UITransform, Layers, Rect, Size, Vec2, Graphics, Color, isValid } from 'cc';
import type { DiveSession } from '../battle/DiveSession';
import { layerAtDepth } from '../battle/SeaContent';
import type { SeaLayer } from '../battle/SeaContent';
import { SeaBundleLease } from './SeaBundleLease';
import { SEA_ART, SEA_SCENES, SEA_IDENTITIES, BOSS_RIGS, PLAYER_ART } from './SeaArt';
import { enemyArtKey } from './legacyEnemyArt';
import type { WorldProjection } from './WorldProjection';
import { wallTiles } from './WorldScroll';

interface LoadedArt { bundle: AssetManager.Bundle; frames: Map<string, SpriteFrame>; sequences: Map<string, SpriteFrame[]> }
interface Actor { node: Node; sprite: Sprite; key: string; parts: Node[]; bar?: Graphics }

/** Art is leased independently from combat. No timers advance while battle is paused. */
export class SeaWorldView {
  readonly root: Node;
  readonly leases: SeaBundleLease<LoadedArt>;
  private background: Node;
  private actorsRoot: Node;
  private actors = new Map<number, Actor>();
  private sceneLayer?: SeaLayer;
  private sceneArt?: LoadedArt;
  private common?: LoadedArt;
  private commonState: 'loading' | 'ready' | 'error' = 'loading';
  private player?: Actor;
  private dead = false;
  private previousDepth = 0;
  private direction: 1 | -1 = 1;
  private facing: 1 | -1 = 1;
  private height = 812;
  private current?: SeaLayer;
  private snow?: Graphics;
  private scenery: { nodes: Node[]; rate: number; span: number; x: number; offsetY: number; mirror: boolean }[] = [];
  private readonly snowDots = Array.from({ length: 28 }, (_, i) => {
    const phase = (i * 97) % 211 / 211, drift = (i * 53) % 89 / 89;
    return { x: (phase - .5) * 420, speed: 14 + drift * 22, size: .8 + (i % 3) * .35, wobble: 6 + drift * 10 };
  });
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
  prepare(session: DiveSession): void {
    const depth = session.depth;
    if (Math.abs(depth - this.previousDepth) > .01) this.direction = depth > this.previousDepth ? 1 : -1;
    this.previousDepth = depth;
    // A living gate guardian still belongs to the preceding sea at exactly 800/1600m.
    const guardian = Array.from(session.battle.enemies.values()).find(e => e.kind === 'boss' && depth === session.content.gateDepth);
    this.current = guardian?.layer ?? layerAtDepth(depth); this.leases.select(this.current, guardian ? 1 : this.direction);
    if (session.state === 'Running' && this.status !== 'ready') session.pause.add('assets');
    else session.pause.remove('assets');
  }
  retry(): void { this.leases.retry(); if (this.commonState === 'error') void this.loadCommon(); }
  resize(width: number, height: number): void {
    this.height = height;
    this.root.setScale(width / 375, width / 375, 1);
    this.root.getComponent(UITransform)!.setContentSize(375, height);
    // Re-layout backgrounds on viewport changes without reloading textures.
    if (this.sceneArt) { this.clear(this.background); this.buildScene(this.sceneArt); }
  }
  render(session: DiveSession, projection?: WorldProjection): void {
    if (this.dead) return;
    this.prepare(session);
    const layer = this.current!, loaded = this.leases.get(layer), b = session.battle;
    if (loaded && (this.sceneLayer !== layer || this.sceneArt !== loaded)) {
      this.clear(this.background); this.sceneLayer = layer; this.sceneArt = loaded; this.buildScene(loaded);
    }
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
        actor = this.actor(key, identity.swim ?? identity.idle, size, art);
        if (enemy.kind !== 'normal') actor.bar = this.node('Vitality', actor.node).addComponent(Graphics);
        this.actors.set(enemy.id, actor);
      }
      const position=point(enemy);actor.node.setPosition(...position,0);
      actor.node.active=Math.abs(position[0])<260 && Math.abs(position[1])<this.height/2+100;
      const sequence = art.sequences.get(identity.swim ?? '');
      if (sequence) actor.sprite.spriteFrame = sequence[this.lowEnd ? 0 : Math.floor(b.tick / 5) % 4];
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
    this.scrollScene(projection?.y ?? b.player.y);
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
    if (this.sceneLayer === layer) { this.clear(this.background); this.scenery = []; this.sceneArt = undefined; this.sceneLayer = undefined; }
  }
  private buildScene(art: LoadedArt): void {
    const scene = SEA_SCENES[this.sceneLayer!]; if (!scene) return;
    this.scenery = [];
    const span = Math.max(812, this.height);
    const strip = (key: string, width: number, height: number, x: number, rate: number, offsetY = 0, mirror = true): void => {
      const nodes = Array.from({ length: 3 }, (_, i) => this.sprite(`${key}-tile-${i}`, this.background, art.frames.get(key)!, width, height).node);
      this.scenery.push({ nodes, rate, span, x, offsetY, mirror });
    };
    strip(scene.far, 375, span + 2, 0, .18);
    for (const [key, x] of [[scene.left, -150], [scene.right, 150]] as const) {
      if (!key) continue;
      strip(key, 110, span + 2, x, .78);
    }
    if (scene.flora) strip(scene.flora, 120, 120, -136, .78, -span / 2 + 200, false);
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
  private actor(key: string, image: string, size: number, art: LoadedArt): Actor {
    const frame = art.sequences.get(image)?.[0] ?? art.frames.get(image);
    if (!frame) throw new Error(`Missing actor ${image}`);
    const sprite = this.sprite(key, this.actorsRoot, frame, size, size), parts: Node[] = [];
    const rig = BOSS_RIGS[key];
    if (rig) for (const angle of rig.angles) {
      const partFrame = art.frames.get(rig.partKey)!;
      const part = this.sprite(rig.partKey, sprite.node, partFrame, rig.sourcePartSize * size / rig.sourceBodySize * rig.scale, rig.sourcePartSize * size / rig.sourceBodySize * rig.scale);
      part.node.getComponent(UITransform)!.setAnchorPoint(rig.anchor[0], rig.anchor[1]);
      part.node.setPosition(rig.socket[0] * size / 768, rig.socket[1] * size / 768);
      part.node.angle = angle; parts.push(part.node);
    }
    return { node: sprite.node, sprite, key, parts };
  }
  private sprite(name: string, parent: Node, frame: SpriteFrame, width: number, height: number): Sprite {
    const n = this.node(name, parent), s = n.addComponent(Sprite); s.spriteFrame = frame; s.sizeMode = Sprite.SizeMode.CUSTOM;
    n.getComponent(UITransform)!.setContentSize(width, height); return s;
  }
  private node(name: string, parent: Node): Node { const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.addComponent(UITransform); return n; }
  private clear(n: Node): void {
    if (!isValid(n, true)) return;
    for (const child of [...n.children]) if (isValid(child, true)) { child.removeFromParent(); child.destroy(); }
  }
}
