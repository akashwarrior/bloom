import type { FileUIPart } from "ai";

const ASSET_ID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ASSET_URL_PATTERN = new RegExp(`^/api/assets/(${ASSET_ID_PATTERN})$`, "i");

export const IMAGE_FILE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
} as const;

export function getAssetUrl(assetId: string) {
  return `/api/assets/${assetId}`;
}

export function getAssetIdFromUrl(url: string) {
  return ASSET_URL_PATTERN.exec(url)?.[1] ?? null;
}

export type ChatFilePart = FileUIPart & { size?: number };

const BYTES_PER_MB = 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS = 8;
export const MAX_CHAT_ATTACHMENT_SIZE = 5 * BYTES_PER_MB;
export const MAX_CHAT_ATTACHMENTS_SIZE = 25 * BYTES_PER_MB;

export const SUPPORTED_CHAT_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
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
