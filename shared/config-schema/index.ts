/** Envelope shared with domain table validation in balance.ts. */
export interface ConfigEnvelope<T> {
  schemaVersion: number;
  configVersion: string;
  protocolVersion: 1;
  tables: T;
}

export interface NumericRange {
  min: number;
  max: number;
}

export interface NumericFieldSchema {
  type: 'integer' | 'number';
  range: NumericRange;
  required: boolean;
}
