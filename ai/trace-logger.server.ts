import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const fields = new Set([
  "callId", "toolName", "toolCallId", "stepNumber", "finalStepNumber",
  "status", "errorCode", "finishReason", "rawFinishReason", "trigger", "messageId", "messageCount",
  "baseRevisionId", "revisionId", "durationMs", "exitCode", "sourceTokenCount",
  "estimatedTokens", "reportedInputTokens", "tokenLimit",
  "finalTextCharacters", "isAborted", "isContinuation", "awaitingUserInput",
  "modelId", "fromModelId", "toModelId", "attempt", "delayMs", "assetIndex", "batchSize", "cached", "detail",
]);

function traceMetadata(data: unknown) {
  if (!data || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => {
      if (key === "error" && value instanceof Error) return [["errorType", value.name]];
      if (!fields.has(key) || !["number", "boolean", "string"].includes(typeof value)) return [];
      return [[key, typeof value === "string" ? value.slice(0, key === "detail" ? 400 : 128) : value]];
    }),
  );
}

export class RequestTraceLogger {
  readonly traceId = randomUUID();
  readonly filePath: string;
  #seq = 0;
  #queue: Promise<void> = Promise.resolve();
  #background = new Set<Promise<unknown>>();

  constructor(projectId: string) {
    const segment = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    this.filePath = path.join(process.cwd(), "logs", segment, `${timestamp}_${this.traceId}.jsonl`);
  }

  write(event: string, data?: unknown) {
    const line = JSON.stringify({
      seq: this.#seq++,
      timestamp: new Date().toISOString(),
      traceId: this.traceId,
      event,
      data: traceMetadata(data),
    });
    this.#queue = this.#queue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, line + "\n", "utf8");
    }).catch(() => {});
    return this.#queue;
  }

  track(operation: PromiseLike<unknown>) {
    const tracked = Promise.resolve(operation).catch(() => undefined);
    this.#background.add(tracked);
    void tracked.finally(() => this.#background.delete(tracked));
    return tracked;
  }

  async flush() {
    await Promise.all(this.#background);
    await this.#queue;
  }
}

export function createRequestTraceLogger(projectId: string) {
  return new RequestTraceLogger(projectId);
}
