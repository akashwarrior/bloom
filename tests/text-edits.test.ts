import assert from "node:assert/strict";
import test from "node:test";

import { applyTextEdits } from "../lib/runtime/text-edits.ts";

const file = [
  "export function Hero() {",
  "  return (",
  "    <h1>Hello</h1>",
  "  );",
  "}",
  "",
].join("\n");

test("replaces one exact anchor", () => {
  const result = applyTextEdits("app/page.tsx", file, [
    { oldString: "<h1>Hello</h1>", newString: "<h1>Hi</h1>" },
  ]);

  assert.ok(result.includes("<h1>Hi</h1>"));
  assert.ok(!result.includes("Hello"));
});

test("applies replacements in order against the evolving file", () => {
  const result = applyTextEdits("x.tsx", "a", [
    { oldString: "a", newString: "b" },
    { oldString: "b", newString: "c" },
  ]);

  assert.equal(result, "c");
});

test("inserts text by repeating the surrounding anchor", () => {
  const result = applyTextEdits("x.tsx", "  return <h1 />;\n", [
    {
      oldString: "  return ",
      newString: "  const title = \"Hi\";\n  return ",
    },
  ]);

  assert.equal(result, "  const title = \"Hi\";\n  return <h1 />;\n");
});

test("deletes text with an empty newString", () => {
  const result = applyTextEdits("x.tsx", "a\nb\nc", [
    { oldString: "b\n", newString: "" },
  ]);

  assert.equal(result, "a\nc");
});

test("treats newString literally", () => {
  const result = applyTextEdits("x.tsx", "price = 10", [
    { oldString: "10", newString: "$& $1 \\n" },
  ]);

  assert.equal(result, "price = $& $1 \\n");
});

test("rejects missing, repeated, empty, and no-op replacements", () => {
  assert.throws(
    () => applyTextEdits("x.tsx", "abc", [{ oldString: "z", newString: "y" }]),
    /x\.tsx: replacement 1 oldString was not found/,
  );
  assert.throws(
    () => applyTextEdits("x.tsx", "a a", [{ oldString: "a", newString: "b" }]),
    /appears 2 times/,
  );
  assert.throws(
    () => applyTextEdits("x.tsx", "aaa", [{ oldString: "aa", newString: "b" }]),
    /appears 2 times/,
  );
  assert.throws(
    () => applyTextEdits("x.tsx", "abc", [{ oldString: "a", newString: "a" }]),
    /identical to oldString/,
  );
  assert.throws(
    () => applyTextEdits("x.tsx", "abc", [{ oldString: "", newString: "a" }]),
    /must not be empty/,
  );
  assert.throws(
    () => applyTextEdits("x.tsx", "abc", []),
    /made no change/,
  );
});

test("later replacements see earlier results", () => {
  assert.throws(
    () =>
      applyTextEdits("x.tsx", "a", [
        { oldString: "a", newString: "b" },
        { oldString: "a", newString: "c" },
      ]),
    /replacement 2 oldString was not found/,
  );
});
