import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage, type UIMessageChunk } from "ai";
import type { ActivityMarker } from "./activity";
import type { Metadata } from "@/ai/message/metadata";
import type { ChatFilePart } from "@/lib/assets";

export type EditingMessage = {
  id: string;
  text: string;
  files: ChatFilePart[];
  metadata?: Metadata;
};

type ReasoningPartLike = {
  type: string;
  text?: string;
  providerMetadata?: unknown;
};

function hasProviderMetadata(part: ReasoningPartLike) {
  return (
    part.providerMetadata !== null &&
    typeof part.providerMetadata === "object" &&
    Object.keys(part.providerMetadata).length > 0
  );
}

function isEmptyReasoningPart(part: ReasoningPartLike) {
  return part.type === "reasoning" && (part.text ?? "").trim().length === 0;
}

/** Keep canonical provider parts intact for future turns. Only project the visible transcript. */
export function visibleAssistantParts<T extends UIMessage["parts"][number]>(parts: T[]) {
  const stepStart = parts.findLastIndex(part => part.type === "step-start");
  const lastTool = parts.findLastIndex(part => part.type.startsWith("tool-") || part.type === "dynamic-tool");
  // Older messages have no step markers and can include an answer after the last tool.
  const finalStepUsedTools = stepStart >= 0 && lastTool > stepStart;
  const textAfter = Math.max(stepStart, lastTool);
  return parts.filter((part, index) =>
    part.type !== "reasoning" && part.type !== "reasoning-file" &&
    (part.type !== "text" || (!finalStepUsedTools && index > textAfter)),
  );
}

/**
 * Empty reasoning parts can still carry provider item references or encrypted
 * signatures, so those stay in storage. Inert empty parts are dropped.
 */
export function filterEmptyReasoningPartsForStorage<T extends ReasoningPartLike>(
  parts: readonly T[],
): T[] {
  return parts.filter(
    (part) => !isEmptyReasoningPart(part) || hasProviderMetadata(part),
  );
}

/** Tool events stream immediately. Publish the saved answer once run finalization completes. */
export function streamFinalReply(getSavedReply: () => string, getFinishedActivity?: () => ActivityMarker | undefined) {
  let finish: Extract<UIMessageChunk, { type: "finish" }> | undefined;
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "finish") {
        finish = chunk;
      } else if (!chunk.type.startsWith("text-") && !chunk.type.startsWith("reasoning-")) {
        controller.enqueue(chunk);
      }
    },
    flush(controller) {
      const activity = getFinishedActivity?.();
      if (activity) controller.enqueue(activity);
      const reply = getSavedReply();
      if (finish?.finishReason === "stop" && reply) {
        const id = "final-reply";
        controller.enqueue({ type: "text-start", id });
        controller.enqueue({ type: "text-delta", id, delta: reply });
        controller.enqueue({ type: "text-end", id });
      }
      if (finish) controller.enqueue(finish);
    },
  });
}

export function isImageMediaType(mediaType: string) {
  return mediaType === "image" || mediaType.startsWith("image/");
}

export function getMessageText(message: Pick<UIMessage, "parts">) {
  return message.parts.reduce(
    (text, part) =>
      part.type === "text"
        ? `${text}${text ? "\n\n" : ""}${part.text}`
        : text,
    "",
  );
}

export function getMessageFiles(message: Pick<UIMessage, "parts">) {
  return message.parts.filter(
    (part): part is ChatFilePart => part.type === "file",
  );
}

/**
 * True when the latest reply ends on a questionnaire the user has answered, the
 * one case the chat sends a request by itself. A stopped run also ends on
 * finished tool calls and is not a request to continue.
 */
export function answeredUserInput(messages: UIMessage[]) {
  const parts = messages.at(-1)?.parts ?? [];
  const lastStep = parts.slice(parts.findLastIndex((part) => part.type === "step-start") + 1);
  return lastStep.some((part) => part.type === "tool-requestUserInput") &&
    lastAssistantMessageIsCompleteWithToolCalls({ messages });
}
