import assert from "node:assert/strict";
import test from "node:test";

import { resolveFullPageBounds } from "../lib/runtime/full-page-height.ts";

test("resolves full-page height from measurements and the viewport limit", () => {
  assert.deepEqual(
    resolveFullPageBounds({
      measuredPageHeight: 6075,
      minimumPageHeight: 6334,
      viewportHeight: 1080,
      maxViewports: 12,
    }),
    { pageHeight: 6334, height: 6334 },
  );
  assert.deepEqual(
    resolveFullPageBounds({
      measuredPageHeight: 2400,
      viewportHeight: 800,
      maxViewports: 12,
    }),
    { pageHeight: 2400, height: 2400 },
  );
  assert.deepEqual(
    resolveFullPageBounds({
      measuredPageHeight: 20_000,
      minimumPageHeight: 18_000,
      viewportHeight: 800,
      maxViewports: 12,
    }),
    { pageHeight: 20_000, height: 9600 },
  );
});
