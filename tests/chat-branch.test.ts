import assert from "node:assert/strict";
import test from "node:test";

import { applyChatBranch, getChatBranch, replacedDesign } from "../lib/project-chat/branch.ts";
import { answeredUserInput } from "../lib/project-chat/message.ts";
import type { ProjectChatMessage } from "../lib/project-chat/protocol.ts";

function textMessage(id: string, role: "user" | "assistant", text: string): ProjectChatMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

const kept = textMessage("kept", "assistant", "Keep this");
const prompt = textMessage("prompt", "user", "Original prompt");
const reply = textMessage("reply", "assistant", "Old reply");
const later = textMessage("later", "user", "Later turn");
const saved = [kept, prompt, reply, later];

test("an active edit shows the replacement prompt and its attachments", () => {
  const message = textMessage(prompt.id, "user", "Edited prompt");
  const file = {
    type: "file",
    filename: "notes.txt",
    mediaType: "text/plain",
    url: "/api/assets/asset-id",
    size: 32,
  };
  const branch = getChatBranch({
    trigger: "submit-message",
    messageId: prompt.id,
    message: { ...message, parts: [...message.parts, file] },
  });
  assert.ok(branch);
  const visible = applyChatBranch(saved, branch);
  assert.deepEqual(visible.map(({ id }) => id), [kept.id, prompt.id]);
  assert.deepEqual(visible[1].parts, [...message.parts, file]);
  assert.equal(saved.length, 4);
});

test("an active regeneration hides its target reply and later turns on replay", () => {
  const branch = getChatBranch({ trigger: "regenerate-message", messageId: reply.id, message: prompt });
  assert.ok(branch);
  const prefix = applyChatBranch(saved, branch);
  assert.deepEqual(prefix, [kept, prompt]);
  assert.equal(applyChatBranch(prefix, branch), prefix);
  assert.equal(getChatBranch({ trigger: "submit-message", messageId: reply.id, message: reply }), undefined);
});

test("design regeneration uses the replaced design's opening, while ordinary edits have no comparison", () => {
  const design = { type: "tool-designSite", state: "output-available", input: { focus: "Two-column program" }, output: { status: "success" } };
  const preview = (url: string, viewport: string, actions: unknown[] = []) => ({
    type: "tool-webScrape", state: "output-available", input: { url: "/", viewport, actions },
    output: { screenshots: [{ url }] },
  });
  const opening = preview("/api/assets/opening", "desktop");
  assert.equal(replacedDesign([opening]), null);
  assert.equal(replacedDesign([{ ...design, output: { status: "error" } }, opening]), null);
  assert.deepEqual(replacedDesign([opening, design]), { focus: "Two-column program", screenshot: null });
  assert.deepEqual(replacedDesign([design, opening, preview("/api/assets/phone", "mobile"), preview("/api/assets/dialog", "desktop", [{}])]), {
    focus: "Two-column program", screenshot: "/api/assets/opening",
  });
});

test("the chat continues on its own only after the user answers a questionnaire", () => {
  const reply = (...parts: unknown[]) => [prompt, { id: "reply", role: "assistant", parts }] as unknown as ProjectChatMessage[];
  const step = { type: "step-start" };
  const explored = { type: "tool-exploreProject", toolCallId: "explore", state: "output-available", input: {}, output: {} };
  const question = (state: string) => ({
    type: "tool-requestUserInput", toolCallId: "ask", state, input: { questions: [] },
    ...(state === "output-available" ? { output: { answers: [] } } : {}),
  });

  // A stopped run ends on finished tool calls, which is not a request to continue.
  assert.equal(answeredUserInput(reply(step, explored)), false);
  assert.equal(answeredUserInput(reply(step, explored, step, question("input-available"))), false);
  assert.equal(answeredUserInput(reply(step, explored, step, question("output-available"))), true);
  assert.equal(answeredUserInput(reply(step, question("output-available"), step, explored)), false);
  assert.equal(answeredUserInput([prompt]), false);
});
