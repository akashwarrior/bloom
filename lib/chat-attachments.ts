export const BYTES_PER_MB = 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS = 8;
export const MAX_CHAT_ATTACHMENT_SIZE = 5 * BYTES_PER_MB;
export const MAX_CHAT_ATTACHMENTS_SIZE = 25 * BYTES_PER_MB;

export const SUPPORTED_CHAT_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type SupportedChatAttachmentType =
  (typeof SUPPORTED_CHAT_ATTACHMENT_TYPES)[number] | string;

export const CHAT_ATTACHMENT_ACCEPT =
  SUPPORTED_CHAT_ATTACHMENT_TYPES.join(",");

export function isSupportedChatAttachmentType(mediaType: string) {
  return (SUPPORTED_CHAT_ATTACHMENT_TYPES as readonly string[]).includes(
    mediaType,
  );
}

export function getDataUrlSize(url: string): number | undefined {
  if (!url.startsWith("data:")) return undefined;

  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) return undefined;

  const metadata = url.slice(0, commaIndex);
  const data = url.slice(commaIndex + 1);

  if (metadata.endsWith(";base64")) {
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    return Math.floor((data.length * 3) / 4) - padding;
  }

  try {
    return new TextEncoder().encode(decodeURIComponent(data)).byteLength;
  } catch {
    return undefined;
  }
}
