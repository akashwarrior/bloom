import assert from "node:assert/strict";
import test from "node:test";
import { observeResumedStream } from "../lib/project-chat/resumed-stream.ts";

test("a Redis disconnect errors an open replay and cancels its subscription", async () => {
  const redis = new AbortController();
  let canceled = false;
  const source = new ReadableStream<string>({
    start(controller) {
      controller.enqueue("replayed");
    },
    cancel() {
      canceled = true;
    },
  });
  const stream = await observeResumedStream(Promise.resolve(source), redis.signal);
  assert.ok(stream);
  const reader = stream.getReader();
  assert.deepEqual(await reader.read(), { value: "replayed", done: false });

  const reading = reader.read();
  redis.abort();
  await assert.rejects(reading, /chat stream disconnected/);
  assert.equal(canceled, true);
});

test("a disconnect while opening a replay cancels a subscription that arrives later", async () => {
  const redis = new AbortController();
  const opening = Promise.withResolvers<ReadableStream<string>>();
  const stream = observeResumedStream(opening.promise, redis.signal);
  redis.abort();
  await assert.rejects(stream, /chat stream disconnected/);

  const canceled = Promise.withResolvers<void>();
  opening.resolve(new ReadableStream({ cancel: () => canceled.resolve() }));
  await canceled.promise;
});

test("a replay closes when its producer's shared lease stays inactive", { timeout: 1_000 }, async () => {
  const signal = new AbortController().signal;
  let canceled = false;
  let checks = 0;
  const source = new ReadableStream<string>({
    start(controller) { controller.enqueue("replayed"); },
    cancel() { canceled = true; },
  });
  const activity = [true, false, true, false, false];
  const stream = await observeResumedStream(Promise.resolve(source), signal, {
    intervalMs: 5,
    isActive: async () => activity[checks++] ?? false,
  });
  assert.ok(stream);
  const reader = stream.getReader();
  assert.deepEqual(await reader.read(), { value: "replayed", done: false });
  assert.deepEqual(await reader.read(), { value: undefined, done: true });
  assert.equal(checks, activity.length);
  assert.equal(canceled, true);
});
