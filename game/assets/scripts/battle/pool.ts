export interface Pooled { id: number; active: boolean }
export interface PoolCheckpoint { serial: number; slots: unknown[]; free: number[] }

/** Fixed storage. Consumers retain IDs, never a mutable slot across ticks. */
export class Pool<T extends Pooled> {
  private readonly slots: T[];
  private readonly free: T[];
  private readonly live = new Map<number, T>();
  private serial = 0;

  constructor(readonly capacity: number, create: () => T, private readonly reset: (item: T) => void) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Invalid pool capacity');
    this.slots = Array.from({ length: capacity }, () => {
      const item = create(); reset(item); item.id = 0; item.active = false; return item;
    });
    this.free = this.slots.slice().reverse();
  }

  get size(): number { return this.live.size; }
  get(id: number): T | undefined { return this.live.get(id); }

  acquire(): T | undefined {
    const item = this.free.pop();
    if (!item) return undefined;
    item.id = ++this.serial; item.active = true;
    this.live.set(item.id, item);
    return item;
  }

  release(id: number): boolean {
    const item = this.live.get(id);
    if (!item) return false;
    this.live.delete(id);
    this.reset(item);
    item.id = 0; item.active = false;
    this.free.push(item);
    return true;
  }

  *values(): IterableIterator<T> {
    // Fixed slots also make release-during-iteration deterministic.
    for (const item of this.slots) if (item.active) yield item;
  }

  clear(): void { for (const item of this.values()) this.release(item.id); }

  checkpoint(encode: (item: T) => unknown = item => ({ ...item })): PoolCheckpoint {
    return { serial: this.serial, slots: this.slots.map(encode), free: this.free.map(item => this.slots.indexOf(item)) };
  }
  restore(saved: PoolCheckpoint, decode: (value: unknown) => T = value => value as T): void {
    if (!saved || !Number.isSafeInteger(saved.serial) || saved.serial < 0 || saved.slots.length !== this.capacity || new Set(saved.free).size !== saved.free.length) throw new RangeError('Invalid pool checkpoint');
    this.live.clear(); this.free.length = 0; this.serial = saved.serial;
    saved.slots.forEach((value, i) => {
      const item = decode(value);
      if (!item || typeof item.active !== 'boolean' || !Number.isSafeInteger(item.id) || item.id < 0 || item.id > saved.serial || (item.active && (item.id === 0 || this.live.has(item.id)))) throw new RangeError('Invalid pool item');
      Object.assign(this.slots[i], item); if (item.active) this.live.set(item.id, this.slots[i]);
    });
    for (const i of saved.free) {
      if (!Number.isInteger(i) || !this.slots[i] || this.slots[i].active) throw new RangeError('Invalid free slot');
      this.free.push(this.slots[i]);
    }
    if (this.live.size + this.free.length !== this.capacity) throw new RangeError('Incomplete pool checkpoint');
  }
}
