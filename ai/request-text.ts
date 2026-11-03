import type { ModelMessage } from "ai";

/** What the user asked for across the conversation, as plain text. */
export function requestText(messages: ModelMessage[]) {
  return messages.flatMap((message) => {
    if (message.role !== "user") return [];
    if (typeof message.content === "string") return [message.content];
    return message.content.flatMap((part) => part.type === "text" ? [part.text] : []);
  }).join("\n\n").slice(0, 4_000);
}
