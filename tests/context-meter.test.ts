import assert from "node:assert/strict";
import test from "node:test";
import { createUIMessageStream, readUIMessageStream } from "ai";
import { contextMeter } from "../lib/context-meter.ts";
import type { ProjectChatMessage } from "../lib/project-chat/protocol";

test("live and saved context use the same completed step even when a later estimate arrives", async () => {
  const reported = {
    used: 320_000, limit: 400_000,
    breakdown: { input: 200_000, cached: 80_000, output: 22_000, reasoning: 8_000 },
  };
  const stream = createUIMessageStream<ProjectChatMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "data-context-usage", id: "context-usage", data: reported });
      writer.write({ type: "data-context-usage", transient: true, data: { ...reported, used: 40_000 } });
    },
  });
  for await (const message of readUIMessageStream<ProjectChatMessage>({ stream })) {
    const part = message.parts.findLast(p => p.type === "data-context-usage");
    assert.ok(part);
    assert.deepEqual(contextMeter(part.data), {
      used: 320_000, limit: 400_000, share: 0.8,
      counts: { ...reported.breakdown, other: 10_000 },
    });
  }
});

test("an unreported token count stays unknown and a reported zero stays zero", () => {
  assert.equal(contextMeter({ used: 12345, limit: 400_000 }).used, undefined);
  assert.equal(contextMeter({
    used: 0, limit: 400_000, breakdown: { input: 0, cached: 0, output: 0, reasoning: 0 },
  }).used, 0);
});
