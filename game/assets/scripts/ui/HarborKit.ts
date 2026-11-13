import { Node, UITransform, Label, Button, Graphics, Color, Layers, Sprite, SpriteFrame, BitmapFont, Mask, ScrollView, Vec2, isValid } from 'cc';
import { virtualRange } from './harborLayout';
import type { Rect } from './harborLayout';
import { steelPlate, amberPlate } from './PanelSkin';
export const C = { ink: new Color(4, 20, 31), panel: new Color(10, 34, 46, 250), line: new Color(64, 104, 114), text: new Color(235, 239, 219), muted: new Color(147, 175, 176), mint: new Color(103, 229, 202), amber: new Color(244, 198, 122), danger: new Color(255, 137, 115) };
/** Nine-slice borders from the LOO-70 asset list (L/T/R/B px). Corners and rivets never scale. */
export const SKIN_INSETS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  loo70_ui_hull: [32, 40, 32, 32], loo70_ui_gold: [24, 20, 24, 20], loo70_ui_steel: [24, 20, 24, 20],
  loo70_ui_socket: [16, 16, 16, 16], loo70_ui_ribbon: [64, 16, 64, 16], loo70_ui_hud: [16, 16, 16, 16],
  loo70_ui_tech_node: [0, 0, 0, 0],
};
/** SpriteFrame insets are presentation metadata; set them once on the shared frame. */
export function skinnedFrame(frames: ReadonlyMap<string, SpriteFrame>, key: string): SpriteFrame | undefined {
  const frame = frames.get(key);
  if (!frame) return undefined;
  const insets = SKIN_INSETS[key];
  if (!insets) return frame;
  try {
    frame.insetLeft = insets[0]; frame.insetTop = insets[1]; frame.insetRight = insets[2]; frame.insetBottom = insets[3];
  } catch { /* engine without runtime insets keeps the flat art */ }
  return frame;
}
/** Every panel owns a scope. Closing it removes listeners immediately before deferred Node.destroy. */
export class UiScope {
  private cleanup: (() => void)[] = [];
  private closed = false;
  constructor(readonly root: Node, readonly frames: ReadonlyMap<string, SpriteFrame>, readonly digits?: BitmapFont, readonly minTouch = 44) {}
  get alive(): boolean { return !this.closed; }
  own(off: () => void): void { this.cleanup.push(off); }
  dispose(): void { if (this.closed) return; this.closed = true; this.cleanup.splice(0).reverse().forEach(off => off()); if (isValid(this.root, true)) { this.root.active = false; this.root.removeFromParent(); this.root.destroy(); } }
  node(name: string, parent = this.root, x = 0, y = 0, width = 0, height = 0): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.setPosition(x, -y);
    const t = n.addComponent(UITransform); t.setAnchorPoint(0, 1); t.setContentSize(width, height); return n;
  }
  /** Nine-sliced skin sprite (metal frames, ribbons, sockets). Returns undefined without art. */
  skin(name: string, key: string, r: Rect, parent = this.root): Sprite | undefined {
    const frame = skinnedFrame(this.frames, key);
    if (!frame) return undefined;
    const n = this.node(name, parent, r.x, r.y, r.width, r.height);
    const sprite = n.addComponent(Sprite);
    sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.type = Sprite.Type.SLICED; sprite.trim = false;
    // Re-apply the rect after the frame: the Sprite initialiser otherwise adopts the
    // texture's native size and ignores the intended nine-slice box.
    n.getComponent(UITransform)!.setContentSize(r.width, r.height);
    return sprite;
  }
  box(name: string, r: Rect, parent = this.root, color = C.panel): Node {
    const n = this.node(name, parent, r.x, r.y, r.width, r.height), g = n.addComponent(Graphics);
    const skinned = /Panel$|TitlePlate|ToastCard|LoadingPlate/.test(name) && r.height >= 120 && this.skin(`${name}-skin`, 'loo70_ui_hull', { x: 0, y: 0, width: r.width, height: r.height }, n);
    if (skinned) return n;
    if(name==='Scrim'){g.fillColor=color;g.rect(0,-r.height,r.width,r.height);g.fill();}
    else steelPlate(g, 0, 0, r.width, r.height, color, /Panel$|TitlePlate/.test(name));
    return n;
  }
  text(name: string, value: string, x: number, y: number, width: number, height = 24, size = 14, color = C.text, parent = this.root, numeric = false): Label {
    const n = this.node(name, parent, x, y, width, height), l = n.addComponent(Label);
    l.string = value; l.fontSize = size; l.lineHeight = size + 5; l.color = color;
    l.horizontalAlign = Label.HorizontalAlign.LEFT; l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.CLAMP; l.enableWrapText = true;
    if (numeric && this.digits) { l.font = this.digits; l.useSystemFont = false; }
    else { l.useSystemFont = true; l.fontFamily = '"PingFang SC", "Microsoft YaHei", sans-serif'; }
    return l;
  }
  icon(key: string, x: number, y: number, width: number, height = width, parent = this.root): Node {
    const n = this.node(key, parent, x, y, width, height), frame = this.frames.get(key);
    if (frame) { const sprite = n.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM; n.getComponent(UITransform)!.setContentSize(width, height); }
    return n;
  }
  /** Invisible touch target: a Button with no plate, for scene-native devices that draw
   *  their own geometry on the open background (LOO-70 §4: no shared plates). */
  hit(name: string, r: Rect, action: () => void, parent = this.root): Node {
    const n = this.node(name, parent, r.x, r.y, r.width, r.height);
    const b = n.addComponent(Button);
    b.transition = Button.Transition.SCALE; b.zoomScale = .97; b.duration = .08;
    const click = (): void => { if (this.alive && b.interactable) action(); };
    n.on(Button.EventType.CLICK, click); this.own(() => { if (isValid(n, true)) n.off(Button.EventType.CLICK, click); });
    return n;
  }
  button(name: string, r: Rect, title: string, action: () => void, enabled = true, parent = this.root, accent = false): Node {
    const height = Math.max(r.height, this.minTouch), rect = { ...r, y:r.y-(height-r.height)/2, height };
    const n = this.box(name, rect, parent), b = n.addComponent(Button), g=n.getComponent(Graphics)!;
    // Primary actions wear the amber enamel plate (LOO-70 §4); secondary actions keep the
    // steel plate. The gold nine-slice source is 192x80 and crushes below ~60px height.
    const amber = accent;
    const draw=(pressed=false):void=>{g.clear();if(amber){amberPlate(g,0,0,r.width,height,pressed,enabled);return;}steelPlate(g,0,0,r.width,height,enabled?pressed?new Color(25,67,75):C.panel:new Color(15,28,37),false,enabled);};
    draw();
    b.transition = Button.Transition.SCALE; b.zoomScale = 0.97; b.duration = 0.08; b.interactable = enabled;
    const click = (): void => { if (this.alive && b.interactable) action(); };
    n.on(Button.EventType.CLICK, click); this.own(() => { if (isValid(n, true)) n.off(Button.EventType.CLICK, click); });
    const pressed=():void=>{if(b.interactable)draw(true);},released=():void=>draw();
    n.on(Node.EventType.TOUCH_START,pressed);n.on(Node.EventType.TOUCH_END,released);n.on(Node.EventType.TOUCH_CANCEL,released);
    this.own(()=>{if(isValid(n,true)){n.off(Node.EventType.TOUCH_START,pressed);n.off(Node.EventType.TOUCH_END,released);n.off(Node.EventType.TOUCH_CANCEL,released);}});
    const label = this.text(`${name}-label`, title, 8, 2, r.width - 16, height - 4, 13, enabled ? accent ? C.ink : C.text : C.muted, n);
    label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER; return n;
  }
}
/** A recycled, clipped Cocos ScrollView. Node/listener count depends on viewport, not inventory size. */
export class VirtualRows {
  readonly scroll: ScrollView;
  private rows = new Map<number, UiScope>();
  private readonly content: Node;
  private readonly rowHeight: number;
  private readonly viewport: Rect;
  private stopped = false;
  constructor(private readonly owner: UiScope, name: string, r: Rect, private readonly count: number, rowHeight: number,
    private readonly render: (scope: UiScope, index: number) => void) {
    this.rowHeight = rowHeight; this.viewport = r;
    const n = owner.node(name, owner.root, r.x, r.y, r.width, r.height);
    n.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.scroll = n.addComponent(ScrollView); this.scroll.horizontal = false; this.scroll.vertical = true;
    this.scroll.inertia = true; this.scroll.brake = 0.6;
    this.content = owner.node('Content', n, 0, 0, r.width, Math.max(r.height, count * rowHeight)); this.scroll.content = this.content;
    n.on(ScrollView.EventType.SCROLLING, this.refresh, this);
    owner.own(() => { this.stopped = true; if (isValid(n, true)) n.off(ScrollView.EventType.SCROLLING, this.refresh, this); this.rows.forEach(row => row.dispose()); this.rows.clear(); });
    this.refresh();
  }
  get liveRows(): number { return this.rows.size; }
  private refresh = (): void => {
    if (this.stopped) return;
    const offset = this.scroll.getScrollOffset().y;
    const range = virtualRange(this.count, offset, this.viewport.height, this.rowHeight);
    for (const [i, row] of this.rows) if (i < range.start || i >= range.end) { row.dispose(); this.rows.delete(i); }
    for (let i = range.start; i < range.end; i++) if (!this.rows.has(i)) {
      const n = this.owner.node(`Row-${i}`, this.content, 0, i * this.rowHeight, this.viewport.width, this.rowHeight);
      const row = new UiScope(n, this.owner.frames, this.owner.digits, this.owner.minTouch); this.rows.set(i, row); this.render(row, i);
    }
  };
  scrollTo(index: number): void { this.scroll.scrollToOffset(new Vec2(0, index * this.rowHeight), 0); this.refresh(); }
}
