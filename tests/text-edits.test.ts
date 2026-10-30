import assert from "node:assert/strict";
import test from "node:test";

import { applyTextEdits } from "../lib/runtime/text-edits.ts";

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
    () => applyTextEdits("x.tsx", "a", [
      { oldString: "a", newString: "b" },
      { oldString: "a", newString: "c" },
    ]),
    /x\.tsx: replacement 2 oldString was not found/,
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

test("a missed anchor reports the nearest text so the retry needs no extra read", () => {
  const file = ["export const metadata = {", "  title: \"Lingua\",", "}", "", "const FIRST_WEEK = [", "  { day: \"Days 1-2\", title: \"Order with confidence\" },", "]"].join("\n");
  assert.throws(
    () => applyTextEdits("app/page.tsx", file, [{ oldString: "const FIRST_WEEK = [\n  {day:\"Days 1-2\"}", newString: "x" }]),
    /oldString was not found\. Copy the exact current text, including indentation\. The closest text starts at line 3:\n\}\n\nconst FIRST_WEEK = \[\n  \{ day: "Days 1-2"/,
  );
  assert.throws(
    () => applyTextEdits("app/page.tsx", file, [{ oldString: "nothing like this", newString: "x" }]),
    /oldString was not found\. Copy the exact current text, including indentation\. Reread the file first\./,
  );
});
