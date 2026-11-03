import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateImage } from "ai";

import type { RequestTraceLogger } from "./trace-logger.server.ts";
import { imageModel, metaApi } from "./config.ts";
import { CAPACITY_RETRIES, CAPACITY_RETRY_MS, isModelCapacityError } from "./model-capacity-policy.ts";

const imageRequestTimeoutMs = 180_000;
const imageConcurrency = 6;
const transientRetryMs = 2_000;

// The SDK names several source images `image[]`; Meta only accepts `image[0]`, `image[1]` and so on.
const muse = createOpenAI({
  ...metaApi,
  fetch: (input, init) => {
    const form = init?.body instanceof FormData ? init.body : null;
    const images = form?.getAll("image[]") ?? [];
    if (!form || images.length === 0) return fetch(input, init);
    const body = new FormData();
    for (const [key, value] of form) if (key !== "image[]") body.append(key, value);
    images.forEach((image, index) => body.append(`image[${index}]`, image));
    return fetch(input, { ...init, body });
  },
});
const model = muse.image(imageModel);
const slots = new EventTarget();
let active = 0;
/** Until when no request starts after the provider reported a rate limit. */
let coolUntil = 0;

type ImageRequest = Pick<Parameters<typeof generateImage>[0], "prompt" | "aspectRatio"> & {
  abortSignal: AbortSignal;
};
type ImageTrace = Pick<RequestTraceLogger, "write">;

/** The model takes its aspect ratio from a pixel size and picks the real dimensions itself. */
function sizeFor(aspectRatio: ImageRequest["aspectRatio"]) {
  if (!aspectRatio) return undefined;
  const [width, height] = aspectRatio.split(":").map(Number);
  const scale = 1536 / Math.max(width, height);
  return `${Math.round(width * scale)}x${Math.round(height * scale)}` as const;
}

/** One request. A batch shares a fixed number of slots, and nothing starts while a rate limit is resting. */
async function requestImage(
  { prompt, aspectRatio, abortSignal }: ImageRequest,
  assetIndex: number,
  attempt: number,
  logger?: ImageTrace,
) {
  for (;;) {
    const restMs = coolUntil - Date.now();
    if (restMs > 0) await sleep(restMs, undefined, { signal: abortSignal });
    else if (active >= imageConcurrency) await once(slots, "release", { signal: abortSignal });
    else break;
  }
  abortSignal.throwIfAborted();
  active++;

  try {
    await logger?.write("model.image_started", { modelId: imageModel, assetIndex, attempt });
    const deadline = AbortSignal.timeout(imageRequestTimeoutMs);
    try {
      return await generateImage({
        model,
        prompt,
        size: sizeFor(aspectRatio),
        providerOptions: { openai: { outputFormat: "webp" } },
        maxRetries: 0,
        abortSignal: AbortSignal.any([abortSignal, deadline]),
      });
    } catch (error) {
      abortSignal.throwIfAborted();
      deadline.throwIfAborted();
      throw error;
    }
  } finally {
    active--;
    slots.dispatchEvent(new Event("release"));
  }
}

function isTransientFailure(error: unknown) {
  return (error instanceof Error && (error.name === "TimeoutError" || error.name === "AI_NoImageGeneratedError"))
    || (APICallError.isInstance(error) && error.isRetryable);
}

/**
 * Generates one image. A rate limit rests every image before this one is tried
 * again, because it clears with time and not with fast retries. A timeout, an
 * empty response or a server error is tried once more.
 */
export async function generateProjectImage(request: ImageRequest, assetIndex: number, logger?: ImageTrace) {
  let rateLimits = 0;
  let failures = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestImage(request, assetIndex, attempt, logger);
    } catch (error) {
      request.abortSignal.throwIfAborted();
      if (isModelCapacityError(error)) {
        if (rateLimits++ >= CAPACITY_RETRIES) throw error;
        coolUntil = Date.now() + CAPACITY_RETRY_MS;
        await logger?.write("model.capacity_backoff", { modelId: imageModel, assetIndex, attempt, delayMs: CAPACITY_RETRY_MS });
      } else {
        if (!isTransientFailure(error) || failures++ >= 1) throw error;
        await logger?.write("model.image_retry", { modelId: imageModel, assetIndex, attempt, error });
        await sleep(transientRetryMs, undefined, { signal: request.abortSignal });
      }
    }
  }
}
