import type { ModelMessage } from "ai";

import { getAssetIdFromModelFilename } from "./model-asset-reference.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrapeUrl(output: unknown): string | null {
  if (
    !isRecord(output) ||
    output.type !== "content" ||
    !Array.isArray(output.value)
  ) {
    return null;
  }
  const text = output.value.find(
    (part) => isRecord(part) && part.type === "text" && typeof part.text === "string",
  );
  if (!isRecord(text) || typeof text.text !== "string") return null;
  try {
    const value: unknown = JSON.parse(text.text);
    return isRecord(value) && typeof value.url === "string"
      ? normalizeScrapeUrl(value.url)
      : null;
  } catch {
    return null;
  }
}

function hasImages(output: unknown): boolean {
  if (
    !isRecord(output) ||
    output.type !== "content" ||
    !Array.isArray(output.value)
  ) {
    return false;
  }
  return output.value.some((part) =>
    isRecord(part) &&
    (
      part.type === "image" ||
      (
        part.type === "file" &&
        typeof part.mediaType === "string" &&
        part.mediaType.startsWith("image/")
      )
    )
  );
}

export function normalizeScrapeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    return url.replace(/\/+$/, "") || "/";
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const port = parsed.port &&
      !((parsed.protocol === "https:" && parsed.port === "443") ||
        (parsed.protocol === "http:" && parsed.port === "80"))
      ? `:${parsed.port}`
      : "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${host}${port}${pathname}`;
  } catch {
    return url;
  }
}

function imageIdentity(part: Record<string, unknown>) {
  const assetId = getAssetIdFromModelFilename(part.filename);
  if (assetId) return `asset:${assetId}`;
  if (typeof part.filename === "string") return `filename:${part.filename}`;
  if (typeof part.data === "string") return `data:${part.data}`;
  return null;
}

export function isVisualReviewImageFilename(filename: unknown) {
  return typeof filename === "string" &&
    /(?:public-reference|current-preview)/i.test(filename);
}

export function countMessageImageParts(messages: ModelMessage[]): number {
  let count = 0;
  const isImagePart = (part: Record<string, unknown>) =>
    part.type === "image" ||
    (
      part.type === "file" &&
      typeof part.mediaType === "string" &&
      part.mediaType.startsWith("image/")
    );
  messages.forEach((message) => {
    const content: unknown = message.content;
    if (!Array.isArray(content)) return;
    content.forEach((part) => {
      if (!isRecord(part)) return;
      if (isImagePart(part)) {
        count += 1;
        return;
      }
      if (part.type !== "tool-result" || !isRecord(part.output)) return;
      const output = part.output;
      if (output.type !== "content" || !Array.isArray(output.value)) return;
      output.value.forEach((contentPart) => {
        if (isRecord(contentPart) && isImagePart(contentPart)) count += 1;
      });
    });
  });
  return count;
}

/**
 * For each scrape URL, keeps image binaries only for the newest webScrape that
 * contains images and removes image parts from older scrapes of the same URL.
 * A newer scrape without images does not displace the latest image evidence.
 * Scrapes of other URLs and messages without a parseable scrape URL are left
 * unchanged. All non-image message content follows the SDK's normal
 * history/compaction behavior unchanged.
 */
export function supersedeVisualReviewImages(messages: ModelMessage[]) {
  const scrapeResults: Array<{
    messageIndex: number;
    partIndex: number;
    url: string;
  }> = [];
  messages.forEach((message, messageIndex) => {
    const content: unknown = message.content;
    if (!Array.isArray(content)) return;
    content.forEach((part, partIndex) => {
      if (!isRecord(part) || part.type !== "tool-result") return;
      if (part.toolName !== "webScrape" || !isRecord(part.output)) return;
      const url = scrapeUrl(part.output);
      if (url) scrapeResults.push({ messageIndex, partIndex, url });
    });
  });
  if (scrapeResults.length === 0) return messages;

  const newestWithImagesPerUrl = new Map<
    string,
    { messageIndex: number; partIndex: number }
  >();
  scrapeResults.forEach((result) => {
    const message = messages[result.messageIndex];
    const content: unknown = message?.content;
    if (!Array.isArray(content)) return;
    const part = content[result.partIndex];
    if (!isRecord(part) || !isRecord(part.output) || !hasImages(part.output)) {
      return;
    }
    newestWithImagesPerUrl.set(result.url, {
      messageIndex: result.messageIndex,
      partIndex: result.partIndex,
    });
  });
  if (newestWithImagesPerUrl.size === 0) return messages;

  let changed = false;
  const nextMessages = messages.map((message, messageIndex) => {
    const content: unknown = message.content;
    if (!Array.isArray(content)) return message;
    const nextContent = content.flatMap((part, partIndex) => {
      if (
        !isRecord(part) ||
        part.type !== "tool-result" ||
        part.toolName !== "webScrape" ||
        !isRecord(part.output)
      ) {
        return [part];
      }
      const url = scrapeUrl(part.output);
      if (!url) return [part];
      const newest = newestWithImagesPerUrl.get(url);
      if (!newest) return [part];
      const isNewest =
        newest !== undefined &&
        newest.messageIndex === messageIndex &&
        newest.partIndex === partIndex;
      if (isNewest) {
        const output = part.output;
        if (output.type !== "content" || !Array.isArray(output.value)) return [part];
        const seenImages = new Set<string>();
        const nextValue = output.value.filter((contentPart) => {
          if (
            !isRecord(contentPart) ||
            (
              contentPart.type !== "image" &&
              !(
                contentPart.type === "file" &&
                typeof contentPart.mediaType === "string" &&
                contentPart.mediaType.startsWith("image/")
              )
            )
          ) {
            return true;
          }
          const identity = imageIdentity(contentPart);
          if (identity === null || !seenImages.has(identity)) {
            if (identity) seenImages.add(identity);
            return true;
          }
          changed = true;
          return false;
        });
        if (nextValue.length === output.value.length) return [part];
        return [{
          ...part,
          output: { ...output, value: nextValue },
        }];
      }
      const output = part.output;
      if (output.type !== "content" || !Array.isArray(output.value)) return [part];
      const nextValue = output.value.filter((contentPart) => {
        if (
          !isRecord(contentPart) ||
          (
            contentPart.type !== "image" &&
            !(
              contentPart.type === "file" &&
              typeof contentPart.mediaType === "string" &&
              contentPart.mediaType.startsWith("image/")
            )
          )
        ) {
          return true;
        }
        changed = true;
        return false;
      });
      if (nextValue.length === output.value.length) return [part];
      return [{
        ...part,
        output: { ...output, value: nextValue },
      }];
    });
    return nextContent.some((part, index) => part !== content[index]) ||
      nextContent.length !== content.length
      ? { ...message, content: nextContent } as ModelMessage
      : message;
  });

  return changed ? nextMessages : messages;
}
