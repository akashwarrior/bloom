function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Returns true only for provider capacity/rate-limit failures worth rerouting. */
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

const CAPACITY_RETRY_BASE_MS = [4_000, 10_000, 18_000] as const;

/**
 * Jittered, increasing cooldown for image-provider 429s. The longer wait keeps
 * parallel retries from stampeding the same exhausted quota.
 */
export function capacityRetryDelayMs(
  attempt: number,
  random: () => number = Math.random,
) {
  const index = Math.min(
    CAPACITY_RETRY_BASE_MS.length - 1,
    Math.max(0, Math.floor(attempt)),
  );
  const base = CAPACITY_RETRY_BASE_MS[index]!;
  return base + Math.floor(Math.max(0, Math.min(1, random())) * base * 0.4);
}
