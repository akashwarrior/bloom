import assert from "node:assert/strict";
import test from "node:test";

import { convertToModelMessages, safeValidateUIMessages } from "ai";

test("JSON chat parts preserve reasoning signatures and tool evidence", async () => {
  const storedMessages = JSON.parse(
    JSON.stringify([
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "Use this reference image." },
          {
            type: "file",
            mediaType: "image/png",
            filename: "reference.png",
            url: "https://bloom.local-asset.invalid/asset-1",
          },
        ],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Inspected the current design before editing.",
            providerMetadata: {
              google: { thoughtSignature: "reasoning-signature" },
            },
          },
          { type: "text", text: "I updated the hero." },
          {
            type: "tool-applyChanges",
            toolCallId: "tool-1",
            state: "output-available",
            input: { patch: "hero update" },
            output: { changedPaths: ["app/page.tsx"] },
            callProviderMetadata: {
              google: { thoughtSignature: "tool-signature" },
            },
          },
          {
            type: "data-future-context-part",
            data: { version: 1, payload: ["kept", "as", "json"] },
          },
        ],
      },
    ]),
  );

  const validation = await safeValidateUIMessages({ messages: storedMessages });
  assert.equal(validation.success, true);
  if (!validation.success) return;

  assert.deepEqual(
    validation.data[1]?.parts.at(-1),
    storedMessages[1].parts.at(-1),
  );

  const modelMessages = await convertToModelMessages(validation.data);
  assert.deepEqual(modelMessages, [
    {
      role: "user",
      content: [
        { type: "text", text: "Use this reference image." },
        {
          type: "file",
          mediaType: "image/png",
          filename: "reference.png",
          data: {
            type: "url",
            url: new URL("https://bloom.local-asset.invalid/asset-1"),
          },
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "Inspected the current design before editing.",
          providerOptions: {
            google: { thoughtSignature: "reasoning-signature" },
          },
        },
        { type: "text", text: "I updated the hero." },
        {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "applyChanges",
          input: { patch: "hero update" },
          providerExecuted: undefined,
          providerOptions: {
            google: { thoughtSignature: "tool-signature" },
          },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "tool-1",
          toolName: "applyChanges",
          output: {
            type: "json",
            value: { changedPaths: ["app/page.tsx"] },
          },
          providerOptions: {
            google: { thoughtSignature: "tool-signature" },
          },
        },
      ],
    },
  ]);
});
