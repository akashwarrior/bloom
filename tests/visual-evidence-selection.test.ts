import assert from "node:assert/strict";
import test from "node:test";

import { evenlySelectItems, selectBalancedVisualEvidence } from "../ai/context/visual-evidence.ts";

test("evenly selects representative items including both endpoints", () => {
  assert.deepEqual(evenlySelectItems([0, 1, 2, 3, 4, 5], 4), [0, 2, 3, 5]);
  assert.deepEqual(evenlySelectItems([1, 2, 3], 8), [1, 2, 3]);
});

test("retains both reference and preview screenshots during compaction", () => {
  const references = Array.from({ length: 10 }, (_, index) => ({
    filename: `public-reference-${index}.webp`,
  }));
  const previews = Array.from({ length: 10 }, (_, index) => ({
    filename: `current-preview-${index}.webp`,
  }));
  const selected = selectBalancedVisualEvidence(
    [...references, ...previews],
    10,
  );

  assert.equal(
    selected.filter(({ filename }) => filename.startsWith("public-reference"))
      .length,
    5,
  );
  assert.equal(
    selected.filter(({ filename }) => filename.startsWith("current-preview"))
      .length,
    5,
  );
});
