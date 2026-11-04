import assert from "node:assert/strict";
import test from "node:test";

import { capacityRetryDelayMs, isModelCapacityError } from "../ai/model-capacity-policy.ts";

test("recognizes direct and wrapped capacity failures", () => {
  assert.equal(isModelCapacityError({ statusCode: 429 }), true);
  assert.equal(
    isModelCapacityError({
      cause: new Error("Resource exhausted. Please check quota."),
    }),
    true,
  );
  assert.equal(isModelCapacityError(new Error("Invalid tool input")), false);
});

test("capacity retries wait longer each attempt and add bounded jitter", () => {
  assert.equal(capacityRetryDelayMs(0, () => 0), 4_000);
  assert.equal(capacityRetryDelayMs(1, () => 0), 10_000);
  assert.equal(capacityRetryDelayMs(2, () => 0), 18_000);
  assert.equal(capacityRetryDelayMs(9, () => 0), 18_000);
  assert.equal(capacityRetryDelayMs(0, () => 1), 5_600);
  assert.equal(capacityRetryDelayMs(1, () => 0.5), 12_000);
});
