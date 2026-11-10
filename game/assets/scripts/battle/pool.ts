export interface Pooled { id: number; active: boolean }

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
}
