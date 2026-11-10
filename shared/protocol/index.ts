import type { ErrorCode } from '../errors/index.js';

export const PROTOCOL_VERSION = 1 as const;

export interface RequestEnvelope<T> {
  command: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  clientVersion: string;
  sessionEpoch: number;
  payload: T;
}

/** Mutating commands; read-only requests do not require a player revision. */
export interface Command<T> extends RequestEnvelope<T> {
  opId: string;
  expectedRev: number;
}

export interface Snapshot<T> {
  schemaVersion: number;
  cloudRev: number;
  sessionEpoch: number;
  state: T;
}

export interface Receipt<T> {
  opId: string;
  appliedRevision: number;
  result: T;
}

export interface Reply<T, S = unknown> {
  ok: boolean;
  code: 'OK' | ErrorCode;
  requestId: string;
  serverTime: string;
  retryable: boolean;
  receipt?: Receipt<T>;
  snapshot?: { revision: number; sessionEpoch: number; state: S };
}

/** Checkpoints use dive sequence/version, not permanent asset operation IDs. */
export interface DiveCheckpoint<TSummary = unknown> extends RequestEnvelope<TSummary> {
  command: 'dive.checkpoint';
  diveId: string;
  checkpointSeq: number;
  baseStateVersion: number;
}
