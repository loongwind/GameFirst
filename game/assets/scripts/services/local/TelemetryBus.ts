export { EVENT_NAMES } from '@abyss-hunter/shared';
export type { LocalEvent, EventName, TelemetryBatch } from '@abyss-hunter/shared';
import type { LocalEvent, TelemetryBatch } from '@abyss-hunter/shared';

/** Stable IDs permit server-side telemetry dedup; acknowledgements never clear newer events. */
export class TelemetryBus {
  private readonly listeners = new Set<(event: LocalEvent) => void>();
  subscribe(listener: (event: LocalEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(events: readonly LocalEvent[]): void {
    for (const event of events) for (const listener of Array.from(this.listeners)) {
      try { listener(JSON.parse(JSON.stringify(event))); } catch { /* Observers must not invalidate a committed reward. */ }
    }
  }
  static batch(events: LocalEvent[], limit = 100): TelemetryBatch {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid telemetry limit');
    return { command: 'telemetry.batch', protocolVersion: 1, events: JSON.parse(JSON.stringify(events.slice(0, limit))) };
  }
}
