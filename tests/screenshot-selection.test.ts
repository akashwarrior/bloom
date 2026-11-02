import assert from "node:assert/strict";
import test from "node:test";

import { selectScreenshots } from "../lib/runtime/screenshot-selection.ts";

type Capture = { id: string; scrollY: number; bytes: Uint8Array };

function capture(id: string, scrollY: number, byte: number): Capture {
  return { id, scrollY, bytes: new Uint8Array([byte]) };
}

test("keeps the later of two identical frames so coverage reaches its scroll position", () => {
  const selected = selectScreenshots([
    capture("top-a", 0, 1),
    capture("middle", 999, 2),
    capture("top-b", 4995, 1),
  ], 10);

  assert.deepEqual(
    selected.map((entry) => [entry.id, entry.scrollY]),
    [["middle", 999], ["top-b", 4995]],
  );
});

test("selection still caps frames while retaining the bottom frame", () => {
  const selected = selectScreenshots([
    capture("frame-0", 0, 0),
    capture("frame-1", 999, 1),
    capture("frame-2", 1998, 2),
    capture("frame-3", 2997, 3),
    capture("frame-4", 3996, 4),
  ], 3);

  assert.deepEqual(
    selected.map((entry) => entry.scrollY),
    [0, 1998, 3996],
  );
});
