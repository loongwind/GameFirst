/** Schemas only in P1-01. Domain tables and validation are implemented in P1-04. */
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
