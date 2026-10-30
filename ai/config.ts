import type { GoogleLanguageModelOptions, GoogleInteractionsModelId } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import {
  wrapImageModel,
  type ImageModel,
  type LanguageModel,
} from "ai";
import { createHash, randomUUID } from "node:crypto";
import type { RequestTraceLogger } from "@/lib/request-trace-logger.server";
import { isModelCapacityError } from "@/ai/model-capacity-policy";
import { relaxFunctionDeclarations } from "@/ai/provider-schema";
import { createOpenAI, OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';


type ModelOperation =
  | "agent"
  | "agent-fallback"
  | "image"
  | "utility"
  | "vertex-tool"
  | "web-read";

/** Structure of a rejected request (no content), for diagnosing provider 4xx errors. */
function describeRequestShape(body: unknown) {
  try {
    const parsed = JSON.parse(String(body)) as {
      tools?: Array<{ functionDeclarations?: Array<{ name?: string }> }>;
      toolConfig?: unknown;
      contents?: Array<{ role?: string; parts?: Array<Record<string, unknown>> }>;
    };
    return {
      tools: parsed.tools?.flatMap((entry) => entry.functionDeclarations?.map((fn) => fn.name) ?? []),
      toolConfig: parsed.toolConfig,
      contents: parsed.contents?.map((content) => `${content.role}:${(content.parts ?? []).map((part) => Object.keys(part).join("+")).join(",")}`),
    };
  } catch {
    return null;
  }
}

/** Counts images embedded inside function responses (multimodal tool results). */
function countNestedImages(value: unknown, depth = 0): number {
  if (depth > 8 || value === null || typeof value !== "object") return 0;
  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + countNestedImages(item, depth + 1), 0);
  }
  const record = value as Record<string, unknown>;
  const inline = record.inlineData as { mimeType?: unknown } | undefined;
  const file = record.fileData as { mimeType?: unknown } | undefined;
  const own =
    (typeof inline?.mimeType === "string" && inline.mimeType.startsWith("image/")) ||
      (typeof file?.mimeType === "string" && file.mimeType.startsWith("image/"))
      ? 1
      : 0;
  return own + Object.entries(record).reduce(
    (total, [key, item]) =>
      key === "inlineData" || key === "fileData" ? total : total + countNestedImages(item, depth + 1),
    0,
  );
}

function loggedVertexFetch(
  logger: RequestTraceLogger | undefined,
  modelId: string,
  operation: ModelOperation,
) {
  return async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    const requestId = randomUUID();
    if (!options?.body || typeof options.body !== "string") {
      await logger?.write("model.request", {
        requestId,
        modelId,
        operation,
      });
      const startedAt = Date.now();
      const response = await fetch(url, options);
      captureModelResponse(
        logger,
        requestId,
        response,
        startedAt,
        modelId,
        operation,
      );
      return response;
    }
    let contentEvidence: Record<string, number> = {};
    try {
      const bodyObj = JSON.parse(options.body) as {
        tools?: unknown;
        contents?: Array<{
          parts?: Array<{
            text?: unknown;
            inlineData?: { mimeType?: unknown; data?: unknown };
            fileData?: { mimeType?: unknown; fileUri?: unknown };
            functionCall?: { id?: unknown };
            functionResponse?: { id?: unknown };
          }>;
        }>;
      };
      const parts = bodyObj.contents?.flatMap((content) => content.parts ?? []) ?? [];
      contentEvidence = {
        contentCount: bodyObj.contents?.length ?? 0,
        partCount: parts.length,
        textCharacters: parts.reduce(
          (total, part) =>
            total + (typeof part.text === "string" ? part.text.length : 0),
          0,
        ),
        inlineDataParts: parts.filter((part) => part.inlineData).length,
        inlineImageParts: parts.filter(
          (part) =>
            typeof part.inlineData?.mimeType === "string" &&
            part.inlineData.mimeType.startsWith("image/"),
        ).length,
        inlineDataCharacters: parts.reduce(
          (total, part) =>
            total +
            (typeof part.inlineData?.data === "string"
              ? part.inlineData.data.length
              : 0),
          0,
        ),
        fileDataParts: parts.filter((part) => part.fileData).length,
        functionCallParts: parts.filter((part) => part.functionCall).length,
        functionResponseParts: parts.filter((part) => part.functionResponse)
          .length,
        nestedImageParts: countNestedImages(
          parts.map((part) => part.functionResponse).filter(Boolean),
        ),
      };
      bodyObj.contents?.forEach((content) => {
        content.parts?.forEach((part) => {
          if (part.functionCall && "id" in part.functionCall) {
            delete part.functionCall.id;
          }
          if (part.functionResponse && "id" in part.functionResponse) {
            delete part.functionResponse.id;
          }
        });
      });
      if (bodyObj.tools) {
        bodyObj.tools = relaxFunctionDeclarations(bodyObj.tools);
      }
      options.body = JSON.stringify(bodyObj);
    } catch (e) {
      await logger?.write("model.request_parse_error", { requestId, error: e });
    }

    await logger?.write("model.request", {
      requestId,
      modelId,
      operation,
      contentEvidence,
    });
    const startedAt = Date.now();
    const response = await fetch(url, options);
    if (!response.ok) {
      await logger?.write("model.request_rejected", {
        requestId,
        status: response.status,
        requestShape: describeRequestShape(options.body),
      });
    }
    captureModelResponse(
      logger,
      requestId,
      response,
      startedAt,
      modelId,
      operation,
    );
    return response;
  };
}

function captureModelResponse(
  logger: RequestTraceLogger | undefined,
  requestId: string,
  response: Response,
  startedAt = Date.now(),
  modelId = "unknown",
  operation: ModelOperation = "agent",
) {
  if (!logger) return;
  const copy = response.clone();
  logger.track(
    copy
      .text()
      .then((body) => {
        const responseBody = process.env.BLOOM_FULL_AGENT_LOGS === "true"
          ? { body }
          : {
            bodyBytes: Buffer.byteLength(body, "utf8"),
            bodySha256: createHash("sha256").update(body).digest("hex"),
          };
        return logger.write("model.response", {
          requestId,
          modelId,
          operation,
          status: response.status,
          durationMs: Date.now() - startedAt,
          contentType: response.headers.get("content-type"),
          ...responseBody,
        });
      })
      .catch((error) =>
        logger.write("model.response_error", {
          requestId,
          modelId,
          operation,
          error,
        }),
      ),
  );
}

function vertexFor(
  logger?: RequestTraceLogger,
  operation: ModelOperation = "vertex-tool",
) {
  return createVertex({
    apiKey: process.env.GOOGLE_VERTEX_API_KEY,
    fetch: loggedVertexFetch(logger, "vertex-tool", operation),
  });
}

const AGENT_MODEL = (process.env.BLOOM_AGENT_MODEL ?? "gemini-3.5-flash-lite") as GoogleInteractionsModelId;

interface ModelOptions {
  model: LanguageModel;
  providerOptions: {
    vertex: GoogleLanguageModelOptions;
  };
}

export function getModelOptions(
  modelId: GoogleInteractionsModelId = AGENT_MODEL,
  thinkingLevel: "minimal" | "low" | "medium" | "high" = "high",
  logger?: RequestTraceLogger,
  operation: ModelOperation = "agent",
): ModelOptions {

  const vertex = vertexFor(logger, operation);

  return {
    model: vertex(modelId),
    providerOptions: {
      vertex: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel,
        },
      } satisfies GoogleLanguageModelOptions,
    },
  };
}

function isModelUnavailableError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return record.statusCode === 404 ||
    (typeof record.message === "string" && /was not found or your project does not have access/i.test(record.message));
}

const IMAGE_MODEL_IDS = [
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
] as const;

export function getImageModelOptions(
  modelId: (typeof IMAGE_MODEL_IDS)[number] = "gemini-3.1-flash-image",
  logger?: RequestTraceLogger,
): {
  model: ImageModel,
} {
  const vertex = vertexFor(logger, "image");
  const modelIds = [
    modelId,
    ...IMAGE_MODEL_IDS.filter((candidate) => candidate !== modelId),
  ];
  const models = modelIds.map((candidateModelId) => ({
    modelId: candidateModelId,
    model: wrapImageModel({
      model: vertex.image(candidateModelId),
      middleware: { specificationVersion: "v4" },
    }),
  }));

  return {
    model: wrapImageModel({
      model: models[0].model,
      modelId: `${modelId}-capacity-fallback`,
      middleware: {
        specificationVersion: "v4",
        wrapGenerate: async ({ params }) => {
          let capacityError: unknown = null;
          for (let index = 0; index < models.length; index += 1) {
            const candidate = models[index];
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                return await candidate.model.doGenerate(params);
              } catch (error) {
                const unavailable = isModelUnavailableError(error);
                if (!isModelCapacityError(error) && !(unavailable && index > 0)) throw error;
                if (!unavailable) capacityError = error;
                const retrySameModel = !unavailable && attempt < 2;
                await logger?.write("model.capacity_failover", {
                  requestKind: "image",
                  fromModelId: candidate.modelId,
                  toModelId: retrySameModel ? candidate.modelId : models[index + 1]?.modelId ?? null,
                  attempt,
                  error: error instanceof Error
                    ? { name: error.name, message: error.message }
                    : { name: "UnknownError", message: String(error) },
                });
                if (!retrySameModel) break;
                await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
              }
            }
          }
          throw capacityError ?? new Error("All configured image models failed");
        },
      },
    }),
  };
}

export function getUtilityModelOptions(logger?: RequestTraceLogger) {
  return getAgentModelOptions();
}

const model = "muse-spark-1.3-contributor";

const openai = createOpenAI({
  apiKey: process.env.MUSE_API_KEY,
  baseURL: "https://api.meta.ai/v1"
});

export function getAgentModelOptions(logger?: RequestTraceLogger) {
  return {
    model: openai(model) as LanguageModel,
    providerOptions: {
      openai: {
        parallelToolCalls: true,
        forceReasoning: true,
        reasoningSummary: "detailed",
        reasoningEffort: "high",
      } satisfies OpenAILanguageModelResponsesOptions,
    }
  } as const
}
