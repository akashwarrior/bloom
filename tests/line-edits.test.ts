import assert from "node:assert/strict";
import test from "node:test";

import { applyLineEdits } from "../lib/runtime/line-edits.ts";

const file = ["a", "b", "c", "d", "e"].join("\n");

test("line edits replace, delete, and insert against the original numbering", () => {
  const result = applyLineEdits("x.tsx", file, [
    { startLine: 4, endLine: 5, content: "D\nE\nF" },
    { startLine: 2, endLine: 2, content: "" },
    { startLine: 1, endLine: 0, content: "top\n" },
  ]);
  assert.equal(result, ["top", "a", "c", "D", "E", "F"].join("\n"));
});

test("line edits reject overlapping or out-of-range ranges", () => {
  assert.throws(() => applyLineEdits("x.tsx", file, [{ startLine: 2, endLine: 3, content: "" }, { startLine: 3, endLine: 4, content: "" }]), /overlap/);
  assert.throws(() => applyLineEdits("x.tsx", file, [{ startLine: 7, endLine: 7, content: "z" }]), /outside the file/);
  assert.throws(() => applyLineEdits("x.tsx", file, [{ startLine: 3, endLine: 9, content: "z" }]), /endLine/);
  assert.equal(applyLineEdits("x.tsx", file, [{ startLine: 6, endLine: 5, content: "f" }]), `${file}\nf`);
});
