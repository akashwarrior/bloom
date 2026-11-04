import type { FileUIPart, UIMessage, UIMessageChunk } from "ai";
import type { Metadata } from "@/ai/message/metadata";

export type EditingMessage = {
  id: string;
  text: string;
  files: FileUIPart[];
  metadata?: Metadata;
};

type ReasoningPartLike = {
  type: string;
  text?: string;
  providerMetadata?: unknown;
};

type ReasoningStartChunk = Extract<UIMessageChunk, { type: "reasoning-start" }>;
type ReasoningDeltaChunk = Extract<UIMessageChunk, { type: "reasoning-delta" }>;
type ReasoningEndChunk = Extract<UIMessageChunk, { type: "reasoning-end" }>;
type ReasoningChunk = ReasoningStartChunk | ReasoningDeltaChunk | ReasoningEndChunk;

type ReasoningBlock = {
  sourceId: string;
  start: ReasoningStartChunk;
  deltas: ReasoningDeltaChunk[];
  emitted: boolean;
};

function reasoningSeparator(previousText: string) {
  if (previousText.length === 0) return "";
  if (previousText.endsWith("\n\n")) return "";
  if (previousText.endsWith("\n")) return "\n";
  return "\n\n";
}

function withReasoningId(chunk: ReasoningChunk, id: string): ReasoningChunk {
  if (chunk.type === "reasoning-start") {
    return { ...chunk, id } as ReasoningStartChunk;
  }
  if (chunk.type === "reasoning-delta") {
    return { ...chunk, id } as ReasoningDeltaChunk;
  }
  return { ...chunk, id } as ReasoningEndChunk;
}

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

/**
 * Display-only normalization. Stored messages keep their original parts so
 * provider reasoning IDs and signatures remain available for model turns.
 */
export function normalizeReasoningPartsForDisplay<T extends ReasoningPartLike>(
  parts: readonly T[],
): T[] {
  const normalized: T[] = [];

  for (const part of parts) {
    if (isEmptyReasoningPart(part)) continue;

    const previous = normalized.at(-1);
    if (previous?.type === "reasoning" && part.type === "reasoning") {
      const previousText = previous.text ?? "";
      normalized[normalized.length - 1] = {
        ...previous,
        text: `${previousText}${reasoningSeparator(previousText)}${part.text ?? ""}`,
      } as T;
      continue;
    }

    normalized.push(part);
  }

  return normalized;
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

/**
 * Buffers reasoning until the first visible text, drops empty blocks, and
 * merges consecutive blocks under one wire ID. Ends are held until the next
 * non-reasoning chunk because the client rejects deltas after a reasoning end.
 */
export function normalizeReasoningChunks(): TransformStream<
  UIMessageChunk,
  UIMessageChunk
> {
  let visibleId: string | null = null;
  let visibleText = "";
  let heldEnd: ReasoningEndChunk | null = null;
  let block: ReasoningBlock | null = null;

  function closeReasoning(
    controller: TransformStreamDefaultController<UIMessageChunk>,
  ) {
    let closed = false;

    if (block?.emitted && visibleId) {
      controller.enqueue({ type: "reasoning-end", id: visibleId });
      closed = true;
    }
    block = null;

    if (!closed && heldEnd) {
      controller.enqueue(heldEnd);
      closed = true;
    }
    if (!closed && visibleId) {
      controller.enqueue({ type: "reasoning-end", id: visibleId });
    }

    heldEnd = null;
    visibleId = null;
    visibleText = "";
  }

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "reasoning-start") {
        if (block) closeReasoning(controller);
        block = {
          sourceId: chunk.id,
          start: chunk,
          deltas: [],
          emitted: false,
        };
        return;
      }

      if (chunk.type === "reasoning-delta") {
        if (!block || chunk.id !== block.sourceId) return;

        if (block.emitted) {
          if (!visibleId) return;
          controller.enqueue(withReasoningId(chunk, visibleId));
          visibleText += chunk.delta;
          return;
        }

        block.deltas.push(chunk);
        if (!chunk.delta.trim()) return;

        const bufferedText = block.deltas
          .map((delta) => delta.delta)
          .join("");

        if (visibleId) {
          heldEnd = null;
          const separator = reasoningSeparator(visibleText);
          if (separator) {
            controller.enqueue({
              type: "reasoning-delta",
              id: visibleId,
              delta: separator,
            });
            visibleText += separator;
          }
          for (const delta of block.deltas) {
            controller.enqueue(withReasoningId(delta, visibleId));
          }
        } else {
          controller.enqueue(block.start);
          visibleId = block.sourceId;
          visibleText = "";
          for (const delta of block.deltas) {
            controller.enqueue(delta);
          }
        }

        visibleText += bufferedText;
        block.emitted = true;
        block.deltas = [];
        return;
      }

      if (chunk.type === "reasoning-end") {
        if (!block || chunk.id !== block.sourceId) return;

        if (block.emitted && visibleId) {
          heldEnd = withReasoningId(chunk, visibleId) as ReasoningEndChunk;
        }
        block = null;
        return;
      }

      closeReasoning(controller);
      controller.enqueue(chunk);
    },

    flush(controller) {
      closeReasoning(controller);
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
  return message.parts.filter((part): part is FileUIPart => part.type === "file");
}
