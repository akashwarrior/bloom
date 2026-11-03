function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Returns true only for provider capacity/rate-limit failures worth waiting out. */
export function isModelCapacityError(error: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  const record = objectValue(error);
  const statusCode = record.statusCode ?? record.status;
  if (statusCode === 429) return true;

  const message = typeof record.message === "string"
    ? record.message
    : typeof error === "string"
      ? error
      : "";
  if (/\b(?:429|resource exhausted|resource has been exhausted|quota)\b/i.test(message)) {
    return true;
  }

  return record.cause !== undefined
    ? isModelCapacityError(record.cause, depth + 1)
    : false;
}

/** A rate limit clears with time, so a failed image is tried again after this long. */
export const CAPACITY_RETRY_MS = 30_000;

/** How many times an image waits and is tried again before it is reported as failed. */
export const CAPACITY_RETRIES = 4;
