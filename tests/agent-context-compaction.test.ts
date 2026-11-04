import assert from "node:assert/strict";
import test from "node:test";
import z from "zod/v4";

import { compactionOutputSchema } from "../lib/agent-context-compaction.ts";

function minimalCompaction() {
  return {
    resolvedTask: "build a site like metamask.io",
    taskStatus: "in-progress" as const,
    inferredRequirements: [],
    constraints: [],
    decisions: [],
    implementationState: [],
    importantFiles: [],
    commandsAndToolResults: [],
    validationResults: [],
    errorsAndBlockers: [],
    openQuestions: [],
    nextSteps: [],
    sourceCoverage: [{
      sourceArea: "User Message",
      retainedDetails: "The exact reference request was retained.",
      omissions: "None.",
    }],
  };
}

test("accepts concise but valid compaction prose", () => {
  const parsed = compactionOutputSchema.parse(minimalCompaction());
  assert.equal(parsed.sourceCoverage[0]?.omissions, "None.");
});

test("keeps transport bounds without imposing arbitrary prose minimums", () => {
  assert.equal(
    compactionOutputSchema.safeParse({
      ...minimalCompaction(),
      resolvedTask: "x",
      sourceCoverage: [],
    }).success,
    true,
  );
  assert.equal(
    compactionOutputSchema.safeParse({
      ...minimalCompaction(),
      resolvedTask: "x".repeat(20_001),
    }).success,
    false,
  );
});

test("sends no array maxItems to the model, which Gemini rejects with a 400", () => {
  const schema = JSON.stringify(z.toJSONSchema(compactionOutputSchema));
  assert.equal(schema.includes("maxItems"), false);
});
