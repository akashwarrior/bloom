import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const SENSITIVE_KEY =
  /^(?:authorization|cookie|set-cookie|password|secret|token|api[-_]?key|access[-_]?key|accessToken|refreshToken|idToken)$/i;
const SENSITIVE_QUERY_KEY =
  /^(?:key|token|signature|sig|x-goog-signature|x-goog-credential|x-amz-signature|x-amz-credential)$/i;
const INTERNAL_PROVIDER_METADATA_KEY =
  /^(?:callProviderMetadata|resultProviderMetadata|providerMetadata)$/;
const THOUGHT_SIGNATURE_KEY = /^(?:thoughtSignature|thought_signature)$/;

function timestampForPath(date: Date) {
  return date.toISOString().replaceAll(":", "-");
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "unknown";
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function serializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? redactUrl(value) : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return null;
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return redactUrl(value.toString());
  if (value instanceof Error) {
    if (seen.has(value)) return "[Circular Error]";
    seen.add(value);
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause === undefined
        ? {}
        : { cause: serializable(value.cause, seen) }),
    };
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((item) => serializable(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) || THOUGHT_SIGNATURE_KEY.test(key)
          ? "[REDACTED]"
          : INTERNAL_PROVIDER_METADATA_KEY.test(key)
            ? "[PRESERVED_IN_CANONICAL_MESSAGE]"
            : serializable(item, seen),
      ]),
    );
  }
  return String(value);
}

export class RequestTraceLogger {
  readonly traceId: string;
  readonly filePath: string;
  #seq = 0;
  #queue: Promise<void> = Promise.resolve();
  #background = new Set<Promise<void>>();

  constructor(projectId: string) {
    const startedAt = new Date();
    this.traceId = randomUUID();
    const logRoot = path.join(process.cwd(), "logs");
    this.filePath = path.join(
      logRoot,
      safeSegment(projectId),
      `${timestampForPath(startedAt)}_${this.traceId}.jsonl`,
    );
  }

  async write(event: string, data?: unknown) {
    console.log(event);
    const seq = this.#seq++;
    const line = `${JSON.stringify({
      seq,
      timestamp: new Date().toISOString(),
      traceId: this.traceId,
      event,
      ...(data === undefined ? {} : { data: serializable(data) }),
    })}\n`;

    const write = async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, line, "utf8");
    };
    const current = this.#queue.then(write, write);
    this.#queue = current;
    return current;
  }

  track(operation: PromiseLike<unknown>) {
    const tracked = Promise.resolve(operation).then(
      () => undefined,
      (error) => this.write("logger.background_error", { error }),
    );
    this.#background.add(tracked);
    void tracked
      .finally(() => this.#background.delete(tracked))
      .catch(() => undefined);
    return tracked;
  }

  async flush() {
    while (this.#background.size > 0) {
      await Promise.all([...this.#background]);
    }
    await this.#queue;
  }
}

export function createRequestTraceLogger(projectId: string) {
  return new RequestTraceLogger(projectId);
}
