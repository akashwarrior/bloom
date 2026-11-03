import assert from "node:assert/strict";
import test from "node:test";

import { isModelCapacityError } from "../ai/model-capacity-policy.ts";

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
