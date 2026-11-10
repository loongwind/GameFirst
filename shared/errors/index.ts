/** Shared wire codes from technical design §5.1; never expose SDK/internal errors. */
export const ERROR_CODES = [
  'REV_CONFLICT', 'STATE_CONFLICT', 'STALE_CHECKPOINT', 'EVENT_INVALID',
  'EVENT_CONSUMED', 'SESSION_REPLACED', 'QUOTA_EXCEEDED', 'TOKEN_EXPIRED',
  'DIVE_EXPIRED', 'ALREADY_PROCESSED', 'INVALID_STATE', 'INVENTORY_FULL',
  'CONFIG_MISMATCH', 'CLIENT_TOO_OLD', 'RISK_REJECTED', 'RETRYABLE',
] as const;

export type ErrorCode = typeof ERROR_CODES[number];
