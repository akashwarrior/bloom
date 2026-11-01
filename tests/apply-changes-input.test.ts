import assert from "node:assert/strict";
import test from "node:test";

import { applyChangesInputSchema, groupApplyChanges } from "../ai/tools/apply-changes-input.ts";

const create = { type: "create", path: "components/hero.tsx", content: "export function Hero() {\n  return <h1>Hello</h1>;\n}\n" };
const update = { type: "update", path: "app/page.tsx", startLine: 4, endLine: 6, content: "<Hero />" };
const remove = { type: "delete", path: "components/old.tsx" };

test("accepts one entry of each type", () => {
  for (const change of [create, update, remove]) {
    const parsed = applyChangesInputSchema.parse({ changes: [change] });
    assert.deepEqual(parsed.changes[0], change);
  }
});

test("groups a mixed batch by operation and path", () => {
  const batch = applyChangesInputSchema.parse({
    changes: [
      create,
      update,
      { ...update, startLine: 10, endLine: 10, content: "<Footer />" },
      { ...update, path: "app/layout.tsx", startLine: 1, endLine: 1, content: "import './globals.css';" },
      remove,
    ],
  });

  const { creates, editsByPath, deletes } = groupApplyChanges(batch.changes);
  assert.deepEqual(creates, [{ path: create.path, content: create.content }]);
  assert.deepEqual([...editsByPath.keys()], ["app/page.tsx", "app/layout.tsx"]);
  assert.deepEqual(editsByPath.get("app/page.tsx"), [
    { startLine: 4, endLine: 6, content: "<Hero />" },
    { startLine: 10, endLine: 10, content: "<Footer />" },
  ]);
  assert.deepEqual(deletes, [remove.path]);
});

test("rejects missing and extra fields per type", () => {
  const invalid = [
    { type: "create", path: "a.tsx" },
    { type: "create", path: "a.tsx", content: "x", startLine: 1 },
    { type: "update", path: "a.tsx", endLine: 2, content: "x" },
    { type: "update", path: "a.tsx", startLine: 1, content: "x" },
    { type: "delete", path: "a.tsx", content: "x" },
    { type: "move", path: "a.tsx" },
  ];
  for (const change of invalid) {
    assert.equal(applyChangesInputSchema.safeParse({ changes: [change] }).success, false, JSON.stringify(change));
  }
});

test("rejects an empty batch and more than 40 entries", () => {
  assert.equal(applyChangesInputSchema.safeParse({ changes: [] }).success, false);
  assert.equal(
    applyChangesInputSchema.safeParse({ changes: Array.from({ length: 41 }, () => create) }).success,
    false,
  );
});

test("rejects the old three-array input", () => {
  const result = applyChangesInputSchema.safeParse({
    createFiles: [create],
    updateFiles: [update],
    deleteFiles: [remove],
  });
  assert.equal(result.success, false);
});

test("rejects a stringified changes payload", () => {
  const result = applyChangesInputSchema.safeParse({ changes: JSON.stringify([create]) });
  assert.equal(result.success, false);
});
