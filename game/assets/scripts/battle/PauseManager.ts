export type PauseReason = 'modal' | 'ad' | 'background' | 'reconnect' | 'countdown';

/** Removing one owner never resumes another owner's pause. */
export class PauseManager {
  private readonly active = new Set<PauseReason>();
  constructor(private readonly changed: () => void = () => {}) {}
  get paused(): boolean { return this.active.size > 0; }
  get reasons(): readonly PauseReason[] { return Array.from(this.active); }
  has(reason: PauseReason): boolean { return this.active.has(reason); }
  add(reason: PauseReason): void {
    if (this.active.has(reason)) return;
    this.active.add(reason); this.changed();
  }
  remove(reason: PauseReason): void {
    if (this.active.delete(reason)) this.changed();
  }
}
