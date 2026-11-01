import assert from "node:assert/strict";
import test from "node:test";
import type { ModelMessage } from "ai";

import { replayableReasoning } from "../ai/reasoning-replay.ts";

const reasoning = (content?: string) => ({ type: "reasoning" as const, text: "", providerOptions: { openai: { itemId: "rs_1", ...(content ? { reasoningEncryptedContent: content } : {}) } } });
const call = { type: "tool-call" as const, toolCallId: "c1", toolName: "readFiles", input: {} };

test("reasoning is replayed only when it is encrypted and followed by output", () => {
  const user: ModelMessage = { role: "user", content: "hi" };
  const kept: ModelMessage = { role: "assistant", content: [reasoning("enc"), call] };
  assert.deepEqual(replayableReasoning([user, kept]), [user, kept]);

  // An older reply that only referenced reasoning stored on the provider's side.
  assert.deepEqual(replayableReasoning([{ role: "assistant", content: [reasoning(), call] }]), [{ role: "assistant", content: [call] }]);
  // A run stopped while thinking: nothing follows the reasoning, so the turn is dropped.
  assert.deepEqual(replayableReasoning([user, { role: "assistant", content: [reasoning("enc")] }]), [user]);
  // Reasoning after the last output of a message is dropped; the answer stays.
  assert.deepEqual(
    replayableReasoning([{ role: "assistant", content: [reasoning("enc"), { type: "text", text: "Done." }, reasoning("enc")] }]),
    [{ role: "assistant", content: [reasoning("enc"), { type: "text", text: "Done." }] }],
  );
});
