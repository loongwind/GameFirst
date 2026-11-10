import { Node, UITransform, Label, Button, Graphics, Color, Layers, Sprite, SpriteFrame, BitmapFont, Mask, ScrollView, Vec2, isValid } from 'cc';
import { virtualRange } from './harborLayout';
import type { Rect } from './harborLayout';
export const C = { ink: new Color(4, 27, 42), panel: new Color(8, 45, 64, 248), line: new Color(36, 96, 115), text: new Color(234, 250, 255), muted: new Color(148, 188, 203), mint: new Color(84, 238, 226), amber: new Color(255, 202, 122), danger: new Color(255, 137, 115) };
/** Every panel owns a scope. Closing it removes listeners immediately before deferred Node.destroy. */
export class UiScope {
  private cleanup: (() => void)[] = [];
  private closed = false;
  constructor(readonly root: Node, readonly frames: ReadonlyMap<string, SpriteFrame>, readonly digits?: BitmapFont) {}
  get alive(): boolean { return !this.closed; }
  own(off: () => void): void { this.cleanup.push(off); }
  dispose(): void { if (this.closed) return; this.closed = true; this.cleanup.splice(0).reverse().forEach(off => off()); if (isValid(this.root, true)) { this.root.active = false; this.root.removeFromParent(); this.root.destroy(); } }
  node(name: string, parent = this.root, x = 0, y = 0, width = 0, height = 0): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.setPosition(x, -y);
    const t = n.addComponent(UITransform); t.setAnchorPoint(0, 1); t.setContentSize(width, height); return n;
  }
  box(name: string, r: Rect, parent = this.root, color = C.panel): Node {
    const n = this.node(name, parent, r.x, r.y, r.width, r.height), g = n.addComponent(Graphics);
    g.fillColor = color; g.strokeColor = C.line; g.lineWidth = 1;
    g.roundRect(0, -r.height, r.width, r.height, Math.min(12, r.height / 2)); g.fill(); g.stroke(); return n;
  }
  text(name: string, value: string, x: number, y: number, width: number, height = 24, size = 14, color = C.text, parent = this.root, numeric = false): Label {
    const n = this.node(name, parent, x, y, width, height), l = n.addComponent(Label);
    l.string = value; l.fontSize = size; l.lineHeight = size + 5; l.color = color;
    l.horizontalAlign = Label.HorizontalAlign.LEFT; l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.CLAMP; l.enableWrapText = true;
    if (numeric && this.digits) { l.font = this.digits; l.useSystemFont = false; }
    else { l.useSystemFont = true; l.fontFamily = 'sans-serif'; }
    return l;
  }
  icon(key: string, x: number, y: number, width: number, height = width, parent = this.root): Node {
    const n = this.node(key, parent, x, y, width, height), frame = this.frames.get(key);
    if (frame) { const sprite = n.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM; n.getComponent(UITransform)!.setContentSize(width, height); }
    return n;
  }
  button(name: string, r: Rect, title: string, action: () => void, enabled = true, parent = this.root, accent = false): Node {
    const n = this.box(name, r, parent, accent ? new Color(26, 85, 87) : C.panel), b = n.addComponent(Button);
    b.transition = Button.Transition.SCALE; b.zoomScale = 0.97; b.duration = 0.08; b.interactable = enabled;
    const click = (): void => { if (this.alive && b.interactable) action(); };
    n.on(Button.EventType.CLICK, click); this.own(() => { if (isValid(n, true)) n.off(Button.EventType.CLICK, click); });
    const label = this.text(`${name}-label`, title, 8, 2, r.width - 16, r.height - 4, 13, enabled ? accent ? C.mint : C.text : C.muted, n);
    label.horizontalAlign = Label.HorizontalAlign.CENTER; return n;
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
      const row = new UiScope(n, this.owner.frames, this.owner.digits); this.rows.set(i, row); this.render(row, i);
    }
  };
  scrollTo(index: number): void { this.scroll.scrollToOffset(new Vec2(0, index * this.rowHeight), 0); this.refresh(); }
}
