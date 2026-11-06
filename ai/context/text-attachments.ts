import type { ModelMessage } from "ai";

const MODEL_ASSET_PREFIX = "bloom-asset:";
const ATTACHMENT_FALLBACK_FILENAME = "attachment.txt";

function displayFilename(filename: string | undefined) {
  if (!filename) return ATTACHMENT_FALLBACK_FILENAME;
  if (!filename.startsWith(MODEL_ASSET_PREFIX)) return filename;

  const separator = filename.indexOf("__", MODEL_ASSET_PREFIX.length);
  if (separator === -1) return filename;

  return filename.slice(separator + 2) || ATTACHMENT_FALLBACK_FILENAME;
}

function textAttachmentText(filename: string | undefined, bytes: Uint8Array) {
  const name = displayFilename(filename);
  return [
    `Attached file "${name}":`,
    "",
    new TextDecoder().decode(bytes),
    "",
    `[End of attached file "${name}"]`,
  ].join("\n");
}

function hydratedTextBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof Uint8Array) return data;
  if (typeof data !== "object" || data === null || data instanceof URL) {
    return undefined;
  }

  const tagged = data as { type?: unknown; data?: unknown };
  return tagged.type === "data" && tagged.data instanceof Uint8Array
    ? tagged.data
    : undefined;
}

/**
 * The agent model accepts images and PDFs as file parts, but not text files.
 * Text attachments are inlined so their contents still reach the model while
 * the stored chat message keeps the file part for display and editing.
 */
export function inlineTextAttachmentParts(
  messages: ModelMessage[],
): ModelMessage[] {
  let changed = false;

  const next = messages.map((message) => {
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      !Array.isArray(message.content)
    ) {
      return message;
    }

    let contentChanged = false;
    const content = message.content.map((part) => {
      if (part.type !== "file" || part.mediaType !== "text/plain") {
        return part;
      }

      const bytes = hydratedTextBytes(part.data);
      if (!bytes) return part;

      contentChanged = true;
      return {
        type: "text" as const,
        text: textAttachmentText(part.filename, bytes),
      };
    });

    if (!contentChanged) return message;
    changed = true;
    return { ...message, content } as ModelMessage;
  });

  return changed ? next : messages;
}
