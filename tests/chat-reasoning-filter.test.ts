import assert from "node:assert/strict";
import test from "node:test";
import { createUIMessageStream, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import {
  filterEmptyReasoningPartsForStorage,
  getMessageText,
  streamFinalReply,
  visibleAssistantParts,
} from "../lib/project-chat/message.ts";

function textBlock(id: string, text: string): UIMessageChunk[] {
  return [
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
  ];
}

test("tool calls stream live and only the committed final answer reaches chat and history", async () => {
  let finishRun!: () => void;
  const working = new Promise<void>(resolve => { finishRun = resolve; });
  let savedReply = "";
  let persisted: UIMessage | undefined;
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const steps: UIMessageChunk[] = [
        { type: "start", messageId: "run" },
        { type: "start-step" },
        { type: "reasoning-start", id: "r" },
        { type: "reasoning-delta", id: "r", delta: "Thinking" },
        { type: "reasoning-end", id: "r" },
        ...textBlock("aside", "I will read the file."),
        { type: "tool-input-available", toolCallId: "one", toolName: "read", input: {} },
        { type: "tool-output-available", toolCallId: "one", output: "contents" },
        { type: "finish-step" },
        { type: "start-step" },
        ...textBlock("summary", "Fixed the menu."),
      ];
      for (const chunk of steps) writer.write(chunk);
      await working;
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onEnd: ({ responseMessage }) => {
      persisted = responseMessage;
      savedReply = getMessageText({ parts: visibleAssistantParts(responseMessage.parts) });
    },
  });
  let displayed: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream: stream.pipeThrough(streamFinalReply(() => savedReply)) })) {
    displayed = message;
    if (!persisted) {
      assert.equal(getMessageText(message), "");
      assert.ok(message.parts.every(part => part.type !== "reasoning"));
      if (message.parts.some(part => part.type === "tool-read" && part.state === "output-available")) finishRun();
    }
  }
  assert.ok(persisted && displayed);
  assert.ok(persisted.parts.some(part => part.type === "reasoning"));
  assert.equal(getMessageText(displayed), "Fixed the menu.");
  assert.deepEqual(displayed.parts, visibleAssistantParts(persisted.parts));
});

test("a pending question or a tool-only last step has no summary", () => {
  const parts = [
    { type: "step-start" },
    { type: "text", text: "Starting work" },
    { type: "step-start" },
    { type: "tool-requestUserInput", toolCallId: "one", state: "input-available", input: {} },
    { type: "text", text: "Waiting for input" },
  ] satisfies UIMessage["parts"];
  assert.equal(getMessageText({ parts: visibleAssistantParts(parts) }), "");
  assert.ok(visibleAssistantParts(parts).some(part => part.type === "tool-requestUserInput"));
});

test("a direct reply can be displayed without any tool calls", () => {
  const parts = [{ type: "text", text: "Sí, ya está listo." }] satisfies UIMessage["parts"];
  assert.deepEqual(visibleAssistantParts(parts), parts);
});

test("interrupted and uncommitted runs never publish buffered model text", async () => {
  for (const ending of [
    { type: "abort" },
    { type: "finish", finishReason: "length" },
    { type: "finish", finishReason: "stop" },
  ] satisfies UIMessageChunk[]) {
    const source = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of [...textBlock("draft", "Partial"), ending]) controller.enqueue(chunk);
        controller.close();
      },
    });
    const chunks = await Array.fromAsync(source.pipeThrough(streamFinalReply(() => "")));
    assert.deepEqual(chunks, [ending]);
  }
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

test("question continuations keep each run’s tools separate from the transcript and from each other", async () => {
  const { getActivityDetails, getRunParts, isActivityDetail } = await import("../lib/project-chat/activity.ts");
  type Part = import("../lib/project-chat/activity.ts").ChatPart;
  const mark = (runId: string): Part => ({ type: "data-activity", id: runId, data: { runId, startedAt: 1, finishedAt: 2 } });
  const one = { type: "dynamic-tool", toolName: "read", toolCallId: "one", state: "output-available", input: {}, output: "first" } as const;
  const two = { ...one, toolCallId: "two", output: "second" };
  const question: Part = {
    type: "tool-requestUserInput", toolCallId: "question", state: "output-available",
    input: { questions: [{ id: "mode", header: "Mode", question: "Which mode?", allowFreeText: true }] },
    output: { answers: [{ questionId: "mode", text: "Dark" }] },
  };
  const parts: Part[] = [mark("first"), one, question, mark("second"), two, { type: "step-start" }, { type: "text", text: "Updated the theme." }];
  assert.deepEqual(getActivityDetails(parts, "first"), [one]);
  assert.deepEqual(getActivityDetails(parts, "second"), [two]);
  assert.deepEqual(getActivityDetails(parts, "another"), []);
  assert.deepEqual(getRunParts(parts, "first"), [one, question]);
  assert.ok(visibleAssistantParts(parts).filter(part => !isActivityDetail(part)).includes(question));
});
