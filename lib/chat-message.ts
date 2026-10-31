import type { FileUIPart, UIMessage } from "ai";
import type { Metadata } from "@/ai/message/metadata";

export type EditingMessage = {
  id: string;
  text: string;
  files: FileUIPart[];
  metadata?: Metadata;
};

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
