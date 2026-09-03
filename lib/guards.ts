/**
 * Narrows a parsed-JSON value to a plain object. Arrays and `null` are both
 * `typeof 'object'`, so both have to be excluded explicitly — every caller here
 * is validating untrusted input (a backup file, a model response) where either
 * one is a plausible thing to receive.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
