type Layer = 'sunlight' | 'twilight' | 'abyss';
type LoadState = 'loading' | 'ready' | 'error' | 'absent';
interface Entry<T> { state: LoadState; value?: T }

/** Owns only this view's references. In-flight requests are reused even across rapid revisits. */
export class SeaBundleLease<T> {
  current?: Layer;
  private wanted = new Set<Layer>();
  private entries = new Map<Layer, Entry<T>>();
  private dead = false;
  constructor(private readonly load: (layer: Layer) => Promise<T>, private readonly release: (value: T) => void,
    private readonly beforeRelease: (layer: Layer) => void = () => {}) {}

  select(layer: Layer, wanted?: Iterable<Layer>): void {
    if (this.dead) return;
    this.current = layer;
    // Depth-threshold residency (LOO-70 §3): the caller derives the keep-set from depth so
    // neighbouring layers preload ahead of their visual band and are never evicted by a
    // direction flip. Loading entries are left untouched: in-flight requests are never
    // cancelled and always settle into the resident set if it still wants them.
    // Copied element-wise: Set spread is unsafe under the Creator build's loose helpers.
    this.wanted = new Set<Layer>();
    this.wanted.add(layer);
    for (const keep of wanted ?? []) this.wanted.add(keep);
    for (const [key, entry] of this.entries) if (!this.wanted.has(key) && entry.state !== 'loading') {
      if (entry.value !== undefined) { this.beforeRelease(key); this.release(entry.value); }
      this.entries.delete(key);
    }
    for (const key of this.wanted) if (!this.entries.has(key)) this.start(key);
  }
  get(layer: Layer): T | undefined { return this.wanted.has(layer) ? this.entries.get(layer)?.value : undefined; }
  state(layer: Layer): LoadState { return this.wanted.has(layer) ? this.entries.get(layer)?.state ?? 'absent' : 'absent'; }
  retry(): void {
    if (this.dead) return;
    for (const layer of this.wanted) if (this.entries.get(layer)?.state === 'error') this.start(layer);
  }
  dispose(): void {
    if (this.dead) return;
    this.dead = true; this.wanted.clear();
    for (const [layer, entry] of this.entries) if (entry.value !== undefined) { this.beforeRelease(layer); this.release(entry.value); }
    this.entries.clear();
  }
  private start(layer: Layer): void {
    const entry: Entry<T> = { state: 'loading' }; this.entries.set(layer, entry);
    void this.load(layer).then(value => {
      if (this.dead || !this.wanted.has(layer)) {
        this.release(value);
        if (this.entries.get(layer) === entry) this.entries.delete(layer);
      } else { entry.value = value; entry.state = 'ready'; }
    }, () => {
      if (!this.dead && this.wanted.has(layer)) entry.state = 'error';
      else if (this.entries.get(layer) === entry) this.entries.delete(layer);
    });
  }
}
