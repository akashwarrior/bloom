import assert from "node:assert/strict";
import test from "node:test";

import { fontDownloadFailed } from "../lib/runtime/runtime-diagnostics.ts";

test("a failed Google font download is told apart from an error in the project's code", () => {
  const stuck = [
    "⚠ [next]/internal/font/google/9d473eb2c81ea1b1-s.p.woff2",
    "Warning: Error while requesting resource",
    "There was an issue establishing a connection while requesting https://fonts.gstatic.com/s/publicsans/v21/ijwRs572Xtc6ZYQws9YVwnNGfJ7QwOk1.woff2",
    "Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'",
  ].join("\n");
  assert.equal(fontDownloadFailed(stuck), true);
  assert.equal(fontDownloadFailed("There was an issue establishing a connection while requesting https://fonts.googleapis.com/css2?family=Sora"), true);
  assert.equal(fontDownloadFailed("Error: Module not found: Can't resolve './missing-component'"), false);
  assert.equal(fontDownloadFailed("✓ Compiled in 101ms\n GET / 200 in 53ms"), false);
  // A page rendered after the failure means the server recovered and needs no restart.
  assert.equal(fontDownloadFailed(`${stuck}\n GET / 500 in 10ms`), true);
  assert.equal(fontDownloadFailed(`${stuck}\n GET / 200 in 41ms (next.js: 1.4ms)`), false);
});
