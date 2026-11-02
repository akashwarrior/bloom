import assert from "node:assert/strict";
import test from "node:test";

import { evenlySelectItems } from "../lib/evenly-select-items.ts";

test("evenly selects representative items including both endpoints", () => {
  assert.deepEqual(evenlySelectItems([0, 1, 2, 3, 4, 5], 4), [0, 2, 3, 5]);
});

test("returns every item when the requested limit is larger", () => {
  assert.deepEqual(evenlySelectItems([1, 2, 3], 8), [1, 2, 3]);
});
