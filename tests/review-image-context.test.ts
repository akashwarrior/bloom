import assert from "node:assert/strict";
import test from "node:test";
import type { ModelMessage } from "ai";

import {
  normalizeScrapeUrl,
  supersedeVisualReviewImages,
} from "../lib/review-image-context.ts";

function webScrapeResult(
  toolCallId: string,
  url: string,
  files: Array<{ assetId: string; filename: string }>,
  targetKind: "preview" | "public" = "public",
): ModelMessage {
  return {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId,
      toolName: "webScrape",
      output: {
        type: "content",
        value: [
          {
            type: "text",
            text: JSON.stringify({
              targetKind,
              url,
            }),
          },
          ...files.map(({ assetId, filename }) => ({
            type: "file" as const,
            data: { type: "data" as const, data: new Uint8Array([1, 2, 3]) },
            mediaType: "image/webp",
            filename: `bloom-asset:${assetId}__${filename}`,
          })),
        ],
      },
    }],
  };
}

function reviewImageCount(message: ModelMessage) {
  if (!Array.isArray(message.content)) return 0;
  const result = message.content[0];
  if (result?.type !== "tool-result" || result.output.type !== "content") return 0;
  return result.output.value.filter(
    (part) => part.type === "file" && part.mediaType.startsWith("image/"),
  ).length;
}

const fiveImages = [
  { assetId: "shot-1", filename: "reference-1.webp" },
  { assetId: "shot-2", filename: "reference-2.webp" },
  { assetId: "shot-3", filename: "reference-3.webp" },
  { assetId: "shot-4", filename: "reference-4.webp" },
  { assetId: "shot-5", filename: "reference-5.webp" },
];

test("evicts images only from older scrapes of the same normalized URL", () => {
  const messages = [
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
    webScrapeResult("metamask-2", "https://www.metamask.io/", fiveImages),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(reviewImageCount(result[0]!), 0);
  assert.equal(reviewImageCount(result[1]!), 5);
});

test("keeps images of different URLs side by side", () => {
  const messages = [
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
    webScrapeResult(
      "localhost-1",
      "http://localhost:3000/",
      fiveImages,
      "preview",
    ),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(reviewImageCount(result[0]!), 5);
  assert.equal(reviewImageCount(result[1]!), 5);
});

test("evicts across scrape kinds when the URL matches", () => {
  const messages = [
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
    webScrapeResult(
      "metamask-2",
      "https://metamask.io/",
      fiveImages,
      "preview",
    ),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(reviewImageCount(result[0]!), 0);
  assert.equal(reviewImageCount(result[1]!), 5);
});

test("keeps old images when the newest scrape of the same URL produced none", () => {
  const messages = [
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
    webScrapeResult("metamask-2", "https://metamask.io/", []),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(reviewImageCount(result[0]!), 5);
  assert.equal(reviewImageCount(result[1]!), 0);
});

test("keeps only the latest image-bearing scrape when a newer scrape has no images", () => {
  const messages = [
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
    webScrapeResult("metamask-2", "https://metamask.io/", [
      { assetId: "fresh-1", filename: "fresh-1.webp" },
      { assetId: "fresh-2", filename: "fresh-2.webp" },
    ]),
    webScrapeResult("metamask-3", "https://metamask.io/", []),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(reviewImageCount(result[0]!), 0);
  assert.equal(reviewImageCount(result[1]!), 2);
  assert.equal(reviewImageCount(result[2]!), 0);
});

test("deduplicates identical images inside the newest scrape", () => {
  const messages = [
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
    webScrapeResult("metamask-2", "https://metamask.io/", [
      { assetId: "dup-shot", filename: "pair-1.webp" },
      { assetId: "dup-shot", filename: "pair-2.webp" },
      { assetId: "unique-shot", filename: "unique.webp" },
    ]),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(reviewImageCount(result[1]!), 2);
});

test("does not alter non-image message content", () => {
  const message = webScrapeResult("scrape-1", "https://example.com/", [
    { assetId: "preview", filename: "preview.webp" },
  ]);
  const resultPart = Array.isArray(message.content) ? message.content[0] : null;
  assert.ok(resultPart?.type === "tool-result");
  assert.equal(resultPart.output.type, "content");
  resultPart.output.value.push({
    type: "file",
    data: { type: "data", data: new Uint8Array([4]) },
    mediaType: "application/pdf",
    filename: "review.pdf",
  });

  const result = supersedeVisualReviewImages([message]);
  const outputPart = Array.isArray(result[0]?.content)
    ? result[0].content[0]
    : null;
  assert.ok(outputPart?.type === "tool-result");
  assert.equal(outputPart.output.type, "content");
  assert.equal(
    outputPart.output.value.some(
      (part) => part.type === "file" && part.mediaType === "application/pdf",
    ),
    true,
  );
  assert.equal(reviewImageCount(result[0]!), 1);
});

test("leaves standalone review-image parts untouched", () => {
  const messages = [
    {
      role: "user" as const,
      content: [{
        type: "file" as const,
        data: { type: "data" as const, data: new Uint8Array([9]) },
        mediaType: "image/webp",
        filename: "bloom-asset:compacted-old__current-preview-top-0.webp",
      }],
    },
    webScrapeResult("metamask-1", "https://metamask.io/", fiveImages),
  ];

  const result = supersedeVisualReviewImages(messages);
  assert.equal(Array.isArray(result[0]?.content) ? result[0].content.length : -1, 1);
  assert.equal(reviewImageCount(result[1]!), 5);
});

test("normalizes equivalent URLs to the same key", () => {
  assert.equal(normalizeScrapeUrl("https://metamask.io/"), "metamask.io");
  assert.equal(normalizeScrapeUrl("https://www.metamask.io/"), "metamask.io");
  assert.equal(normalizeScrapeUrl("http://metamask.io"), "metamask.io");
  assert.equal(normalizeScrapeUrl("https://metamask.io/path?a=1#top"), "metamask.io/path");
  assert.equal(normalizeScrapeUrl("http://localhost:3000/"), "localhost:3000");
  assert.equal(normalizeScrapeUrl("/"), "/");
  assert.equal(normalizeScrapeUrl("/docs"), "/docs");
});
