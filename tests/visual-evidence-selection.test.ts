import assert from "node:assert/strict";
import test from "node:test";

import { selectBalancedVisualEvidence } from "../lib/visual-evidence-selection.ts";

test("retains both reference and preview screenshots during compaction", () => {
  const references = Array.from({ length: 10 }, (_, index) => ({
    filename: `clone-reference-${index}.webp`,
  }));
  const previews = Array.from({ length: 10 }, (_, index) => ({
    filename: `current-preview-${index}.webp`,
  }));
  const selected = selectBalancedVisualEvidence(
    [...references, ...previews],
    10,
  );

  assert.equal(
    selected.filter(({ filename }) => filename.startsWith("clone-reference"))
      .length,
    5,
  );
  assert.equal(
    selected.filter(({ filename }) => filename.startsWith("current-preview"))
      .length,
    5,
  );
});
