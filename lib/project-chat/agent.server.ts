import "server-only";

import {
  convertToModelMessages,
  stepCountIs, streamText, toUIMessageStream,
  type FinishReason, type ModelMessage, type UIMessageStreamWriter, type UserModelMessage,
} from "ai";

import type { BuildSession } from "@/ai/build-session";
import type { DataPart } from "@/ai/message/data-part";
import { getAgentModelOptions } from "@/ai/config";
import { buildSystemPrompt } from "@/ai/system-prompt";
import { repairToolInput } from "@/ai/tool-input-repair";
import { replayableReasoning } from "@/ai/reasoning-replay";
import { tools } from "@/ai/tools";
import {
  compactAgentContext, contextCheckpointModelMessages,
  estimateModelMessageTokens, type StoredContextCheckpoint,
} from "@/ai/context/agent-context.server";
import { resolveGeneratedImageForModel } from "@/ai/generated-assets.server";
import type { replacedDesign } from "./branch";
import { getAssetIdFromUrl } from "@/lib/assets";
import { hydrateModelMessageAssets, type ResolvedMessageAssets } from "@/ai/context/message-assets.server";
import { AGENT_CONTEXT_TOKEN_LIMIT } from "@/ai/context/checkpoint";
import { readDesignState } from "@/ai/design/write-design-system.server";
import { describeSelections } from "@/lib/design-mode/selection";
import { inlineTextAttachmentParts } from "@/ai/context/text-attachments";
import type { RequestTraceLogger } from "@/ai/trace-logger.server";
import { supersedeVisualReviewImages } from "@/ai/context/review-images";
import type { RuntimeFile } from "@/lib/runtime/protocol";
import type { ProjectChatMessage } from "./protocol";

/** A build includes the design pass, the page, its images, captures and up to two rounds of design-review revisions. */
const STEP_LIMIT = 120;
/** From here on the agent is told to finish instead of being cut off mid-edit. */
const WRAP_UP_STEPS = 10;

const SCAFFOLD_FILES = new Set(["app/globals.css", "app/layout.tsx", "app/page.tsx", "app/icon.svg", "lib/utils.ts"]);

/** What the project already is, so the first step is the work instead of a look around. */
function projectStateNote(files: RuntimeFile[], designed: boolean) {
  const authored = files
    .map((file) => file.path)
    .filter((path) => /^(?:app|components|lib)\//.test(path) && path !== "app/icon.svg")
    .sort();
  const scaffold = authored.every((path) => SCAFFOLD_FILES.has(path));
  if (!designed && scaffold) {
    return "Project state: an empty scaffold with no design yet. `app/page.tsx` is a placeholder, `app/layout.tsx` only imports `app/globals.css`, which holds the Tailwind and ui-sdk imports and a link reset, and `lib/utils.ts` exports `cn()`. There is nothing to explore; begin with `designSite`.";
  }
  const listed = authored.slice(0, 80).join(", ");
  const more = authored.length > 80 ? `, and ${authored.length - 80} more` : "";
  return designed
    ? `Project state: it has an applied design, described in DESIGN.md. Source files: ${listed}${more}.`
    : `Project state: it has no applied design; a UI change needs \`designSite\` first. Source files: ${listed}${more}.`;
}

export type AgentOutcome = {
  generationFailed: boolean;
  failedSourceTools: Set<string>;
  finalAgentModelMessages: ModelMessage[];
  completedAgentStep: boolean;
  compactedThisRun: boolean;
  agentGenerationEnded: boolean;
  agentFinishReason?: FinishReason;
};

export async function streamProjectAgent({
  id, writer, signal, logger, session, outcome, baseFiles, modelUIMessages,
  requestMessages, storedContextCheckpoint, modelAssetsByUrl,
  candidateAssetIds, requiredAssetIds, previousDesign,
}: {
  id: string;
  writer: UIMessageStreamWriter<ProjectChatMessage>;
  signal: AbortSignal;
  logger: RequestTraceLogger;
  session: BuildSession;
  outcome: AgentOutcome;
  baseFiles: RuntimeFile[];
  modelUIMessages: ProjectChatMessage[];
  requestMessages: ProjectChatMessage[];
  storedContextCheckpoint: StoredContextCheckpoint | null;
  modelAssetsByUrl: ResolvedMessageAssets["assetsByModelUrl"];
  previousDesign: ReturnType<typeof replacedDesign>;
  candidateAssetIds: string[];
  requiredAssetIds: string[];
}) {
  let finalContextAssetIds = candidateAssetIds;
  // Edits keep the existing design contract. A redesign replaces it when
  // the agent calls designSite.
  const savedDesign = readDesignState(baseFiles);
  session.appliedDirection = savedDesign?.direction ?? null;
  session.appliedConceptUrl = savedDesign?.notes.conceptUrl ?? null;

  const agentTools = tools({
    projectId: id,
    writer,
    signal,
    logger,
    session,
  });

  const messagesWithSelections = modelUIMessages.map((message) =>
    message.role === "user" && message.metadata?.selections?.length
      ? {
        ...message,
        parts: [
          ...message.parts,
          {
            type: "text" as const,
            text: describeSelections(message.metadata.selections, baseFiles),
          },
        ],
      }
      : message,
  );
  const modelMessages = replayableReasoning(inlineTextAttachmentParts([
    ...(storedContextCheckpoint
      ? await contextCheckpointModelMessages(id, storedContextCheckpoint)
      : []),
    ...hydrateModelMessageAssets(
      await convertToModelMessages(messagesWithSelections, {
        tools: agentTools,
      }),
      modelAssetsByUrl,
    ),
  ]));

  /** Calls that reached a tool; a call the SDK rejected for invalid input never does. */
  const executedToolCalls = new Set<string>();
  let currentStepInputMessages = modelMessages;
  let contextEstimate = 0;
  let latestUsage: DataPart["context-usage"] | undefined;
  outcome.finalAgentModelMessages = modelMessages;
  const toolEventBase = (event: {
    callId: string;
    toolCall: { toolCallId: string; toolName: string };
  }) => ({
    callId: event.callId,
    toolCallId: event.toolCall.toolCallId,
    toolName: event.toolCall.toolName,
  });
  // The previous answer is comparison material for this run, outside the saved branch.
  let comparison: UserModelMessage | undefined;
  if (previousDesign) {
    const image = previousDesign.screenshot
      ? await resolveGeneratedImageForModel(id, previousDesign.screenshot).catch(() => null)
      : null;
    comparison = { role: "user", content: [
      { type: "text", text: `Previous design being replaced by Regenerate. Its recorded direction: ${previousDesign.focus || "(unavailable)"}` },
      ...(image ? [{ type: "file" as const, mediaType: image.mediaType, data: { type: "data" as const, data: image.data } }] : []),
    ] };
    if (image) session.replacedOpening = comparison;
  }
  const basePrompt = `${buildSystemPrompt()}\n\n${projectStateNote(baseFiles, Boolean(savedDesign))}`;
  const systemPrompt = previousDesign
    ? basePrompt + "\n\nThe user regenerated an answer that created a design. Use the previous design as a comparison. Choose a different composition and content hierarchy within the original brief. Preserve any layout or reference the user explicitly required. A palette or font change alone repeats the previous layout."
    : basePrompt;
  await logger.write("generation.started", { messageCount: modelMessages.length });

  const result = streamText({
    ...getAgentModelOptions({ parallelToolCalls: true, promptCacheKey: id }),
    instructions: systemPrompt,
    messages: modelMessages,
    abortSignal: signal,
    tools: agentTools,
    // One step may carry several calls. They run one after another in the order the model
    // wrote them, so an edit followed by a capture in the same step captures the edit.
    toolCallConcurrency: 1,
    // A large call sometimes arrives with a nested array as a JSON string or with a key the tool does not
    // take; mend it instead of rejecting a whole page of source.
    repairToolCall: async ({ toolCall, inputSchema }) => {
      const schema = await Promise.resolve(inputSchema({ toolName: toolCall.toolName })).catch(() => null);
      const input = repairToolInput(toolCall.input, schema?.properties ? Object.keys(schema.properties) : null);
      if (!input) return null;
      await logger.write("tool.call_repaired", { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName });
      return { ...toolCall, input };
    },
    stopWhen: stepCountIs(STEP_LIMIT),
    onError: async ({ error }) => {
      outcome.generationFailed = true;
      await logger.write("generation.source_error", { error });
    },
    onEnd: async (event) => {
      outcome.agentGenerationEnded = true;
      outcome.agentFinishReason = event.finishReason;
      await logger.write("generation.finished", {
        finishReason: event.finishReason,
        rawFinishReason: event.rawFinishReason,
        finalStepNumber: event.stepNumber,
        finalTextCharacters: event.text.length,
      });
    },
    prepareStep: async ({ messages: stepMessages, steps }) => {
      let preparedMessages = supersedeVisualReviewImages(comparison ? stepMessages.filter(m => m !== comparison) : stepMessages);
      session.stepsLeft = STEP_LIMIT - steps.length;
      session.designResultUnread = false;
      const estimatedTokens = estimateModelMessageTokens(preparedMessages);
      const previousStep = steps.at(-1);
      const reportedInputTokens = previousStep?.usage.inputTokens ?? 0;
      const sourceTokenCount = Math.max(
        estimatedTokens,
        reportedInputTokens,
      );
      contextEstimate = sourceTokenCount;

      await logger.write("context.token_check", {
        stepNumber: steps.length,
        estimatedTokens,
        reportedInputTokens,
        sourceTokenCount,
        tokenLimit: AGENT_CONTEXT_TOKEN_LIMIT,
      });

      if (sourceTokenCount >= AGENT_CONTEXT_TOKEN_LIMIT) {
        try {
          const conceptUrl = session.conceptUrl ?? session.appliedConceptUrl;
          const conceptId = conceptUrl && getAssetIdFromUrl(conceptUrl);
          const compactedContext = await compactAgentContext({
            projectId: id,
            messages: preparedMessages,
            lastStepHint: previousStep
              ? {
                stepNumber: previousStep.stepNumber,
                finishReason: previousStep.finishReason,
                content: previousStep.content,
                usage: previousStep.usage,
                performance: previousStep.performance,
              } : "No model step has completed yet in this request.",
            candidateAssetIds: finalContextAssetIds,
            requiredAssetIds: conceptId ? [...requiredAssetIds, conceptId] : requiredAssetIds,
            sourceTokenCount,
            signal,
            logger,
            reason: "token-limit",
          });
          preparedMessages = compactedContext.messages;
          contextEstimate = compactedContext.compactedTokenCount;

          outcome.compactedThisRun = true;
          finalContextAssetIds = compactedContext.retainedAssetIds;
          writer.write({
            type: "data-context-compaction",
            data: {
              sourceTokenCount: compactedContext.sourceTokenCount,
              compactedTokenCount: compactedContext.compactedTokenCount,
            },
          });
        } catch (error) {
          if (signal.aborted) throw error;
          await logger.write("context.compaction_bypassed", {
            error,
            sourceTokenCount,
            reason:
              "Compaction infrastructure failed; continuing with the original context for this run.",
          });
        }
      }
      currentStepInputMessages = preparedMessages;
      outcome.finalAgentModelMessages = preparedMessages;
      writer.write({
        type: "data-context-usage",
        data: { ...latestUsage, used: contextEstimate, limit: AGENT_CONTEXT_TOKEN_LIMIT },
        transient: true,
      });

      if (session.stepsLeft <= WRAP_UP_STEPS) {
        return { messages: [...preparedMessages, {
          role: "user" as const,
          content: `Only ${session.stepsLeft} steps remain in this run before it is cut off. Stop revising. Make sure the page builds, capture desktop and mobile, call finishBuild once, then write the final message and report anything unfinished plainly.`,
        }] };
      }
      if (comparison && !session.previewImages.has("desktop")) {
        const userIndex = preparedMessages.findLastIndex(m => m.role === "user");
        if (userIndex >= 0) return { messages: [...preparedMessages.slice(0, userIndex), comparison, ...preparedMessages.slice(userIndex)] };
      }
      return preparedMessages === stepMessages ? {} : { messages: preparedMessages };
    },
    onStepEnd: async (step) => {
      outcome.finalAgentModelMessages = currentStepInputMessages.concat(
        step.response.messages ?? [],
      );
      outcome.completedAgentStep = true;
      const { inputTokens, outputTokens, totalTokens, inputTokenDetails, outputTokenDetails } = step.usage;
      const cached = inputTokenDetails.cacheReadTokens ?? 0;
      const reasoning = outputTokenDetails.reasoningTokens ?? 0;
      latestUsage = {
        model: step.response.modelId,
        used: totalTokens ?? contextEstimate,
        limit: AGENT_CONTEXT_TOKEN_LIMIT,
        breakdown: inputTokens === undefined && outputTokens === undefined ? undefined : {
          input: inputTokenDetails.noCacheTokens ?? Math.max(0, (inputTokens ?? 0) - cached),
          cached,
          output: outputTokenDetails.textTokens ?? Math.max(0, (outputTokens ?? 0) - reasoning),
          reasoning,
        },
      };
      writer.write({ type: "data-context-usage", id: "context-usage", data: latestUsage });
      for (const part of step.content) {
        if (part.type === "tool-error" && !executedToolCalls.has(part.toolCallId)) {
          // Which rule the input broke, without the input itself.
          const message = typeof part.error === "string" ? part.error : part.error instanceof Error ? part.error.message : "";
          await logger.write("tool.call_rejected", {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            detail: message.split("Error message:").at(-1)?.replace(/\s+/g, " ").trim(),
          });
        }
      }
      await logger.write("generation.step", {
        callId: step.callId,
        stepNumber: step.stepNumber,
        modelId: step.response.modelId,
        finishReason: step.finishReason,
        rawFinishReason: step.rawFinishReason,
        messageCount: currentStepInputMessages.length,
        reportedInputTokens: inputTokens,
      });
    },
    onToolExecutionStart: (event) =>
      event ? logger.write("tool.execution_started", toolEventBase(event)) : undefined,
    onToolExecutionEnd: (event) => {
      if (!event) return;
      executedToolCalls.add(event.toolCall.toolCallId);
      const base = {
        ...toolEventBase(event),
        durationMs: event.toolExecutionMs,
      };
      const output = event.toolOutput;
      const result = output?.type === "tool-result" && "output" in output ? output.output : undefined;
      const object = result && typeof result === "object" ? result : null;
      const error = object && "error" in object ? object.error : undefined;
      const status = object && "status" in object ? object.status : undefined;
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const failed = output?.type !== "tool-result" || Boolean(error) || status === "error" || status === "failed";
      if (base.toolName === "designSite" || base.toolName === "applyChanges") {
        if (failed) outcome.failedSourceTools.add(base.toolName);
        else outcome.failedSourceTools.delete(base.toolName);
      }
      return logger.write("tool.execution_finished", {
        ...base,
        status: failed ? "error" : "success",
        errorCode: typeof code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : undefined,
      });
    },
  });

  writer.merge(
    toUIMessageStream({
      stream: result.stream,
      originalMessages: requestMessages,
      sendReasoning: true,
      sendSources: true,
      sendFinish: true,
      sendStart: true,
      // The SDK uses this formatter for individual tool errors as well as stream errors.
      // streamText.onError and the final finish reason determine whether generation failed.
      onError: () => outcome.generationFailed
        ? "Generation was interrupted. You can retry this run."
        : "The agent could not complete this tool call.",
    }),
  );
}
