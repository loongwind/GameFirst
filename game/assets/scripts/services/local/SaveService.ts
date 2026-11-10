import type { Snapshot } from '@abyss-hunter/shared';
import type { PlatformStorage } from '../../platform/PlatformAdapter';

export interface SaveResult<T> { snapshot: Snapshot<T> | null; sequence: number; status: 'fresh' | 'ok' | 'recovered' }
export interface SaveService {
  load<T>(validate: (state: unknown) => asserts state is T): SaveResult<T>;
  save<T>(snapshot: Snapshot<T>, expectedSequence: number): number;
}
/** Accidental-corruption checksum, not authentication against modified local clients. */
export function checksum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export class LocalSaveService implements SaveService {
  private validator: (state: unknown) => void = () => {};
  constructor(private readonly storage: PlatformStorage, private readonly key = 'save-v1') {}
  load<T>(validate: (state: unknown) => asserts state is T): SaveResult<T> {
    this.validator = validate;
    const valid: { sequence: number; payload: Snapshot<T> }[] = [];
    let present = 0, damaged = 0;
    for (const slot of [0, 1]) {
      const raw = this.storage.getItem(`${this.key}:${slot}`);
      if (raw === null) continue;
      present++;
      try {
        const record = JSON.parse(raw), p = record.payload;
        if (!Number.isSafeInteger(record.sequence) || record.sequence < 1 || record.sequence % 2 !== slot ||
          !p || p.schemaVersion !== 1 || !Number.isSafeInteger(p.cloudRev) || p.cloudRev < 0 ||
          !Number.isSafeInteger(p.sessionEpoch) || p.sessionEpoch < 1 ||
          record.checksum !== checksum(JSON.stringify({ sequence: record.sequence, payload: p }))) throw new Error('Invalid snapshot');
        validate(p.state); valid.push(record);
      } catch { damaged++; }
    }
    if (!valid.length && present) throw new Error('CORRUPT_SAVE: both snapshots invalid; preserve slots for recovery');
    const latest = valid.sort((a, b) => b.sequence - a.sequence)[0];
    return { snapshot: latest?.payload ?? null, sequence: latest?.sequence ?? 0, status: damaged ? 'recovered' : latest ? 'ok' : 'fresh' };
  }
  save<T>(snapshot: Snapshot<T>, expectedSequence: number): number {
    if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 0 || expectedSequence >= Number.MAX_SAFE_INTEGER) throw new RangeError('Invalid save sequence');
    const validator = this.validator;
    let current: SaveResult<unknown>;
    try { current = this.load<unknown>((state): asserts state is unknown => { validator(state); }); }
    finally { this.validator = validator; }
    if (current.sequence !== expectedSequence) throw new Error('SAVE_CONFLICT');
    const sequence = expectedSequence + 1, body = JSON.stringify({ sequence, payload: snapshot });
    const raw = JSON.stringify({ sequence, payload: snapshot, checksum: checksum(body) });
    const key = `${this.key}:${sequence % 2}`;
    this.storage.setItem(key, raw);
    if (this.storage.getItem(key) !== raw) throw new Error('SAVE_VERIFY_FAILED');
    return sequence;
  }
}
