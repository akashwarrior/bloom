import type { LanguageModel } from "ai";
import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";

const model = "muse-spark-1.3-contributor";
export const imageModel = "muse-image-1.0";

export const metaApi = {
  apiKey: process.env.MUSE_API_KEY,
  baseURL: "https://api.meta.ai/v1"
};

const meta = createOpenAI(metaApi);

/** How long the model thinks before it answers. `max` is not offered on the Contributor variant. */
type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Settings for Muse Spark on the Responses API, following Meta's model docs.
 * - `parallelToolCalls` lets the model ask for several tools in one step; nested agents with a single tool keep it off.
 * - `reasoningEffort` defaults to the model's own default; the design director thinks longer, once per build.
 * - `promptCacheKey` keeps one project's requests on the backend that already holds its prompt prefix.
 */
export function getAgentModelOptions({ parallelToolCalls = false, reasoningEffort = "high", promptCacheKey }: {
  parallelToolCalls?: boolean;
  reasoningEffort?: ReasoningEffort;
  promptCacheKey?: string;
} = {}) {
  return {
    model: meta(model) as LanguageModel,
    providerOptions: {
      openai: {
        // The SDK only sends reasoning settings to model ids it recognises; without this the effort is dropped.
        forceReasoning: true,
        reasoningEffort,
        // Reasoning is not shown in the chat, so no summary of it is requested.
        reasoningSummary: null,
        // Stateless replay, the mode Meta recommends for tool loops: each step carries its own encrypted
        // reasoning forward instead of pointing at responses stored on Meta's side, which expire.
        store: false,
        parallelToolCalls,
        strictJsonSchema: true,
        ...(promptCacheKey ? { promptCacheKey } : {}),
      } satisfies OpenAILanguageModelResponsesOptions,
    }
  } as const
}
