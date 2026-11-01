import type { ModelMessage } from "ai";

function encrypted(part: { providerOptions?: Record<string, unknown> }) {
  const options = part.providerOptions?.openai;
  return Boolean(options && typeof options === "object" && "reasoningEncryptedContent" in options && options.reasoningEncryptedContent);
}

/**
 * Keeps only reasoning the API will accept back. Meta rejects a request whose
 * reasoning item has no encrypted content (an older reply that pointed at a
 * response stored on its side) or is not followed by the assistant's text or a
 * tool call (a run stopped while thinking). Dropping one is allowed; that turn
 * just loses its chain of thought.
 */
export function replayableReasoning(messages: ModelMessage[]): ModelMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") return [message];
    const content = message.content.filter((part, index, parts) =>
      part.type !== "reasoning" ||
      (encrypted(part) && parts.slice(index + 1).some((later) => later.type === "text" || later.type === "tool-call")));
    if (content.length === message.content.length) return [message];
    return content.length > 0 ? [{ ...message, content }] : [];
  });
}
