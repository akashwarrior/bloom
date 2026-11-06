import assert from "node:assert/strict";
import test from "node:test";

import type { ModelMessage } from "ai";

import { inlineTextAttachmentParts } from "../ai/context/text-attachments.ts";

const encoder = new TextEncoder();

function contentOf(message: ModelMessage) {
  assert.ok(Array.isArray(message.content));
  return message.content;
}

test("inlines text attachments and leaves image parts untouched", () => {
  const image = {
    type: "file" as const,
    filename: "diagram.png",
    mediaType: "image/png",
    data: { type: "data" as const, data: new Uint8Array([1, 2, 3]) },
  };
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Summarize the attachment." },
        {
          type: "file",
          filename: "bloom-asset:asset-1__Pasted text.txt",
          mediaType: "text/plain",
          data: {
            type: "data",
            data: encoder.encode("first line\nsecond line"),
          },
        },
        image,
      ],
    },
  ];

  const result = inlineTextAttachmentParts(messages);
  const content = contentOf(result[0]);

  assert.equal(content.length, 3);
  assert.deepEqual(content[0], {
    type: "text",
    text: "Summarize the attachment.",
  });
  assert.equal(content[1].type, "text");
  assert.match(
    (content[1] as { text: string }).text,
    /^Attached file "Pasted text\.txt":\n\nfirst line\nsecond line\n\n\[End of attached file "Pasted text\.txt"\]$/,
  );
  assert.equal(content[2], image);

  const originalContent = contentOf(messages[0]);
  assert.equal(originalContent[1].type, "file");
  assert.notEqual(result, messages);
});

test("only inlines hydrated text files and supports non-prefixed filenames", () => {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "file",
          filename: "notes.txt",
          mediaType: "text/plain",
          data: { type: "data", data: encoder.encode("hello") },
        },
        {
          type: "file",
          filename: "remote.txt",
          mediaType: "text/plain",
          data: { type: "url", url: new URL("https://example.com/remote.txt") },
        },
        {
          type: "file",
          filename: "raw.txt",
          mediaType: "text/plain",
          data: { type: "data", data: "aGVsbG8=" },
        },
      ],
    },
  ];

  const content = contentOf(inlineTextAttachmentParts(messages)[0]);

  assert.equal(content[0].type, "text");
  assert.match(
    (content[0] as { text: string }).text,
    /^Attached file "notes\.txt":\n\nhello\n\n\[End of attached file "notes\.txt"\]$/,
  );
  assert.deepEqual(content[1], messages[0].content[1]);
  assert.deepEqual(content[2], messages[0].content[2]);
});
