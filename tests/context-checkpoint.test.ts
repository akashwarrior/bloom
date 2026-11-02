import assert from "node:assert/strict";
import test from "node:test";

import {
  checkpointCanSeedGeneration,
  shouldPersistContextCheckpoint,
} from "../lib/context-checkpoint.ts";

const first = { id: "message-a", createdAt: new Date("2026-08-14T10:00:00Z") };
const second = { id: "message-b", createdAt: new Date("2026-08-14T10:00:00Z") };
const later = { id: "message-c", createdAt: new Date("2026-08-14T10:01:00Z") };

test("uses a checkpoint only when it is strictly before a branch boundary", () => {
  assert.equal(checkpointCanSeedGeneration(first), true);
  assert.equal(checkpointCanSeedGeneration(first, second), true);
  assert.equal(checkpointCanSeedGeneration(second, second), false);
  assert.equal(checkpointCanSeedGeneration(later, second), false);
});

test("persists completed compacted progress even when a later provider call fails", () => {
  const successfulRun = {
    compactedThisRun: true,
    completedAgentStep: true,
    generationFailed: false,
    aborted: false,
  };

  assert.equal(shouldPersistContextCheckpoint(successfulRun), true);
  assert.equal(
    shouldPersistContextCheckpoint({
      ...successfulRun,
      compactedThisRun: false,
    }),
    false,
  );
  assert.equal(
    shouldPersistContextCheckpoint({
      ...successfulRun,
      generationFailed: true,
    }),
    true,
  );
  assert.equal(
    shouldPersistContextCheckpoint({ ...successfulRun, aborted: true }),
    false,
  );
});
