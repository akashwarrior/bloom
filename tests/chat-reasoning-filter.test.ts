import assert from "node:assert/strict";
import test from "node:test";

import {
  createUIMessageStream,
  readUIMessageStream,
  type ProviderMetadata,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import {
  filterEmptyReasoningPartsForStorage,
  normalizeReasoningChunks,
  normalizeReasoningPartsForDisplay,
} from "../lib/chat-message.ts";

function reasoningStart(
  id: string,
  providerMetadata?: ProviderMetadata,
): UIMessageChunk {
  return { type: "reasoning-start", id, providerMetadata };
}

function reasoningDelta(id: string, delta: string): UIMessageChunk {
  return { type: "reasoning-delta", id, delta };
}

function reasoningEnd(
  id: string,
  providerMetadata?: ProviderMetadata,
): UIMessageChunk {
  return { type: "reasoning-end", id, providerMetadata };
}

function textStart(id: string): UIMessageChunk {
  return { type: "text-start", id };
}

function textDelta(id: string, delta: string): UIMessageChunk {
  return { type: "text-delta", id, delta };
}

function textEnd(id: string): UIMessageChunk {
  return { type: "text-end", id };
}

async function runReasoningFilter(chunks: UIMessageChunk[]) {
  const input = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const output: UIMessageChunk[] = [];
  for await (const chunk of input.pipeThrough(normalizeReasoningChunks())) {
    output.push(chunk);
  }
  return output;
}

test("empty reasoning blocks are removed and adjacent blocks merge", async () => {
  const output = await runReasoningFilter([
    reasoningStart("r0"),
    reasoningDelta("r0", "\n"),
    reasoningEnd("r0"),
    reasoningStart("r1"),
    reasoningDelta("r1", "First thought."),
    reasoningEnd("r1"),
    reasoningStart("r2"),
    reasoningDelta("r2", "\n"),
    reasoningDelta("r2", "   "),
    reasoningEnd("r2"),
    reasoningStart("r3"),
    reasoningDelta("r3", "Second thought."),
    reasoningEnd("r3"),
    textStart("t1"),
    textDelta("t1", "Done."),
    textEnd("t1"),
  ]);

  assert.deepEqual(output, [
    reasoningStart("r1"),
    reasoningDelta("r1", "First thought."),
    reasoningDelta("r1", "\n\n"),
    reasoningDelta("r1", "Second thought."),
    reasoningEnd("r1"),
    textStart("t1"),
    textDelta("t1", "Done."),
    textEnd("t1"),
  ]);
});

test("reasoning blocks separated by visible parts or a tool call stay separate", async () => {
  const textSeparated = await runReasoningFilter([
    reasoningStart("r1"),
    reasoningDelta("r1", "First thought."),
    reasoningEnd("r1"),
    textStart("t1"),
    textDelta("t1", "Answer"),
    textEnd("t1"),
    reasoningStart("r2"),
    reasoningDelta("r2", "Second thought."),
    reasoningEnd("r2"),
  ]);

  assert.deepEqual(textSeparated, [
    reasoningStart("r1"),
    reasoningDelta("r1", "First thought."),
    reasoningEnd("r1"),
    textStart("t1"),
    textDelta("t1", "Answer"),
    textEnd("t1"),
    reasoningStart("r2"),
    reasoningDelta("r2", "Second thought."),
    reasoningEnd("r2"),
  ]);

  const toolCall: UIMessageChunk = {
    type: "tool-input-available",
    toolCallId: "tool-1",
    toolName: "readFiles",
    input: {},
  };
  const toolSeparated = await runReasoningFilter([
    reasoningStart("r1"),
    reasoningDelta("r1", "First thought."),
    reasoningEnd("r1"),
    toolCall,
    reasoningStart("r2"),
    reasoningDelta("r2", "Second thought."),
    reasoningEnd("r2"),
  ]);

  assert.deepEqual(toolSeparated, [
    reasoningStart("r1"),
    reasoningDelta("r1", "First thought."),
    reasoningEnd("r1"),
    toolCall,
    reasoningStart("r2"),
    reasoningDelta("r2", "Second thought."),
    reasoningEnd("r2"),
  ]);
});

test("leading whitespace is preserved once real reasoning text arrives", async () => {
  const output = await runReasoningFilter([
    reasoningStart("r1"),
    reasoningDelta("r1", "  "),
    reasoningDelta("r1", "Plan"),
    reasoningDelta("r1", " more."),
    reasoningEnd("r1"),
  ]);

  assert.deepEqual(output, [
    reasoningStart("r1"),
    reasoningDelta("r1", "  "),
    reasoningDelta("r1", "Plan"),
    reasoningDelta("r1", " more."),
    reasoningEnd("r1"),
  ]);
});

test("merged reasoning keeps the last block's end metadata", async () => {
  const output = await runReasoningFilter([
    reasoningStart("r1", { openai: { itemId: "rs_1" } }),
    reasoningDelta("r1", "First."),
    reasoningEnd("r1"),
    reasoningStart("r2", { openai: { itemId: "rs_2" } }),
    reasoningDelta("r2", "Second."),
    reasoningEnd("r2", { openai: { itemId: "rs_2" } }),
  ]);

  assert.deepEqual(output, [
    reasoningStart("r1", { openai: { itemId: "rs_1" } }),
    reasoningDelta("r1", "First."),
    reasoningDelta("r1", "\n\n"),
    reasoningDelta("r1", "Second."),
    reasoningEnd("r1", { openai: { itemId: "rs_2" } }),
  ]);
});

test("non-reasoning chunks pass through unchanged", async () => {
  const chunks: UIMessageChunk[] = [
    textStart("t1"),
    textDelta("t1", "Hello"),
    textEnd("t1"),
  ];

  assert.deepEqual(await runReasoningFilter(chunks), chunks);
});

test("the AI SDK client accepts the merged reasoning stream", async () => {
  const input = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of [
        { type: "start", messageId: "message-1" },
        reasoningStart("r1"),
        reasoningDelta("r1", "First thought."),
        reasoningEnd("r1"),
        reasoningStart("r2"),
        reasoningDelta("r2", "Second thought."),
        reasoningEnd("r2"),
      ] satisfies UIMessageChunk[]) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: input.pipeThrough(normalizeReasoningChunks()),
  })) {
    finalMessage = message;
  }

  const reasoningParts = finalMessage?.parts.filter(
    (part) => part.type === "reasoning",
  );

  assert.equal(reasoningParts?.length, 1);
  assert.equal(reasoningParts?.[0]?.text, "First thought.\n\nSecond thought.");
  assert.equal(reasoningParts?.[0]?.state, "done");
});

test("the client sees merged reasoning while persistence keeps raw parts", async () => {
  let persistedMessage: UIMessage | undefined;
  const stream = createUIMessageStream({
    onEnd: ({ responseMessage }) => {
      persistedMessage = responseMessage;
    },
    execute: async ({ writer }) => {
      for (const chunk of [
        { type: "start", messageId: "message-1" },
        reasoningStart("r1"),
        reasoningDelta("r1", "First thought."),
        reasoningEnd("r1"),
        reasoningStart("r2"),
        reasoningDelta("r2", "Second thought."),
        reasoningEnd("r2"),
        { type: "finish", finishReason: "stop" },
      ] satisfies UIMessageChunk[]) {
        writer.write(chunk);
      }
    },
  });

  let clientMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: stream.pipeThrough(normalizeReasoningChunks()),
  })) {
    clientMessage = message;
  }

  const clientReasoning = clientMessage?.parts.filter(
    (part) => part.type === "reasoning",
  );
  const persistedReasoning = persistedMessage?.parts.filter(
    (part) => part.type === "reasoning",
  );

  assert.equal(clientReasoning?.length, 1);
  assert.equal(clientReasoning?.[0]?.text, "First thought.\n\nSecond thought.");
  assert.equal(persistedReasoning?.length, 2);
});

test("display normalization drops empties and merges adjacent reasoning", () => {
  const parts = normalizeReasoningPartsForDisplay([
    {
      type: "reasoning",
      text: "First thought.",
      providerMetadata: { openai: { itemId: "rs_1" } },
    },
    { type: "reasoning", text: " \n " },
    { type: "reasoning", text: "Second thought." },
    { type: "text", text: "Answer" },
    { type: "reasoning", text: "" },
    { type: "step-start" },
    { type: "reasoning", text: "Third thought." },
  ]);

  assert.deepEqual(parts, [
    {
      type: "reasoning",
      text: "First thought.\n\nSecond thought.",
      providerMetadata: { openai: { itemId: "rs_1" } },
    },
    { type: "text", text: "Answer" },
    { type: "step-start" },
    { type: "reasoning", text: "Third thought." },
  ]);
});

test("storage filtering keeps metadata-bearing empty reasoning", () => {
  const metadata = { openai: { itemId: "rs_1" } };
  const parts = filterEmptyReasoningPartsForStorage([
    { type: "reasoning", text: "", providerMetadata: metadata },
    { type: "reasoning", text: "   " },
    { type: "reasoning", text: "", providerMetadata: {} },
    { type: "reasoning", text: "Visible thought." },
    { type: "text", text: "Hello" },
  ]);

  assert.deepEqual(parts, [
    { type: "reasoning", text: "", providerMetadata: metadata },
    { type: "reasoning", text: "Visible thought." },
    { type: "text", text: "Hello" },
  ]);
});
