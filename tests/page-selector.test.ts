import assert from "node:assert/strict";
import test from "node:test";

import { pageSelector } from "../lib/runtime/page-selector.ts";

test("CSS selectors pass through; a control named by its text is matched as text", () => {
  for (const css of [
    "#email", "[data-slot='dialog-trigger']", "input[type='email']", "button[type='submit']", ".plan > button", "form button", "main",
    "label:has(input[value='10:00'])", "[aria-label='Day and time'] label:nth-child(2)", "input[placeholder='e.g. Jordan Lee']", "input:checked + label", "::-p-text(Open)", "li:has(button:not([disabled]))",
  ]) {
    assert.equal(pageSelector(css), css);
  }
  for (const text of ["You are on the list", "Open account", "text", "10:00", "9:30 AM", "TUE 24", "Regular checkup · 30 min", "a new patient", "Enter a valid email."]) {
    assert.equal(pageSelector(` ${text} `), `::-p-text(${text})`);
  }
  assert.equal(pageSelector("Save (draft)"), "::-p-text(Save \\(draft\\))");
});
