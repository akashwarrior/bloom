import { createVertex } from "@ai-sdk/google-vertex";
import {
  wrapImageModel,
  type ImageModel,
  type LanguageModel,
} from "ai";
import type { RequestTraceLogger } from "@/lib/request-trace-logger.server";
import { capacityRetryDelayMs, isModelCapacityError } from "@/ai/model-capacity-policy";
import { createOpenAI, OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';

const vertex = createVertex({
  apiKey: process.env.GOOGLE_VERTEX_API_KEY,
});

function isModelUnavailableError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return record.statusCode === 404 ||
    (typeof record.message === "string" && /was not found or your project does not have access/i.test(record.message));
}


const IMAGE_MODEL_IDS = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
] as const;

const imageModels = IMAGE_MODEL_IDS.map((candidateModelId) => ({
  modelId: candidateModelId,
  model: wrapImageModel({
    model: vertex.image(candidateModelId),
    middleware: { specificationVersion: "v4" },
  }),
}));

/** Waits out a provider cooldown, but stops immediately when the request is aborted. */
function waitForCapacity(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function getImageModelOptions(logger?: RequestTraceLogger): { model: ImageModel } {
  return {
    model: wrapImageModel({
      model: imageModels[0].model,
      modelId: `${imageModels[0].modelId}-capacity-fallback`,
      middleware: {
        specificationVersion: "v4",
        wrapGenerate: async ({ params }) => {
          let lastError: unknown = null;
          for (const candidate of imageModels) {
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                return await candidate.model.doGenerate(params);
              } catch (error) {
                lastError = error;
                const unavailable = isModelUnavailableError(error);
                const capacity = isModelCapacityError(error);
                if (!unavailable && !capacity) throw error;

                const retrySameModel = capacity && attempt < 2;
                if (retrySameModel) {
                  const delayMs = capacityRetryDelayMs(attempt);
                  await logger?.write("model.capacity_backoff", {
                    requestKind: "image",
                    modelId: candidate.modelId,
                    attempt,
                    delayMs,
                  });
                  await waitForCapacity(delayMs, params.abortSignal);
                }
                await logger?.write("model.capacity_failover", {
                  requestKind: "image",
                  fromModelId: candidate.modelId,
                  toModelId: retrySameModel ? candidate.modelId : imageModels[imageModels.indexOf(candidate) + 1]?.modelId ?? null,
                  attempt,
                  error: error instanceof Error
                    ? { name: error.name, message: error.message }
                    : { name: "UnknownError", message: String(error) },
                });
                if (!retrySameModel) break;
              }
            }
          }
          throw lastError ?? new Error("All configured image models failed");
        },
      },
    }),
  };
}

const model = "muse-spark-1.3-contributor";

const openai = createOpenAI({
  apiKey: process.env.MUSE_API_KEY,
  baseURL: "https://api.meta.ai/v1"
});

export function getAgentModelOptions() {
  return {
    model: openai(model) as LanguageModel,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningSummary: "auto",
        reasoningEffort: "high",
        parallelToolCalls: true,
      } satisfies OpenAILanguageModelResponsesOptions,
    }
  } as const
}
