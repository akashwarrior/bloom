import assert from "node:assert/strict";
import test from "node:test";

import { applyChangesInputSchema, groupApplyChanges } from "../ai/tools/apply-changes-input.ts";

const create = { type: "create", path: "components/hero.tsx", content: "export function Hero() {\n  return <h1>Hello</h1>;\n}\n" };
const replace = { type: "replace", path: "app/page.tsx", oldString: "<Hero />", newString: "<Hero title=\"Hi\" />" };
const remove = { type: "delete", path: "components/old.tsx" };

test("accepts creates, replacements, deletes, and an empty newString", () => {
  for (const change of [create, replace, remove]) {
    const parsed = applyChangesInputSchema.parse({ changes: [change] });
    assert.deepEqual(parsed.changes[0], change);
  }

  const deletion = applyChangesInputSchema.parse({
    changes: [{ ...replace, oldString: "<Old />", newString: "" }],
  });
  assert.deepEqual(groupApplyChanges(deletion.changes).editsByPath.get("app/page.tsx"), [
    { oldString: "<Old />", newString: "" },
  ]);
});

test("groups replacements by path in submission order", () => {
  const batch = applyChangesInputSchema.parse({
    changes: [
      create,
      replace,
      { ...replace, oldString: "<Footer />", newString: "<Footer year={2026} />" },
      { ...replace, path: "app/layout.tsx", oldString: "import './globals.css';", newString: "import './globals.css';\nimport './theme.css';" },
      remove,
    ],
  });

  const { creates, editsByPath, deletes } = groupApplyChanges(batch.changes);
  assert.deepEqual(creates, [{ path: create.path, content: create.content }]);
  assert.deepEqual([...editsByPath.keys()], ["app/page.tsx", "app/layout.tsx"]);
  assert.deepEqual(editsByPath.get("app/page.tsx"), [
    { oldString: "<Hero />", newString: "<Hero title=\"Hi\" />" },
    { oldString: "<Footer />", newString: "<Footer year={2026} />" },
  ]);
  assert.deepEqual(editsByPath.get("app/layout.tsx"), [
    { oldString: "import './globals.css';", newString: "import './globals.css';\nimport './theme.css';" },
  ]);
  assert.deepEqual(deletes, [remove.path]);
});

test("rejects malformed changes and batches", () => {
  const invalid = [
    { type: "create", path: "a.tsx" },
    { type: "create", path: "a.tsx", content: "x", oldString: "x" },
    { type: "replace", path: "a.tsx", newString: "x" },
    { type: "replace", path: "a.tsx", oldString: "x" },
    { type: "replace", path: "a.tsx", oldString: "", newString: "x" },
    { type: "replace", path: "a.tsx", oldString: "x", newString: "y", startLine: 1 },
    { type: "replace", path: "a.tsx", startLine: 1, lineCount: 1, content: "x" },
    { type: "update", path: "a.tsx", oldString: "x", newString: "y" },
    { type: "delete", path: "a.tsx", oldString: "x" },
    { type: "move", path: "a.tsx" },
  ];
  for (const change of invalid) {
    assert.equal(applyChangesInputSchema.safeParse({ changes: [change] }).success, false, JSON.stringify(change));
  }
  assert.equal(applyChangesInputSchema.safeParse({ changes: [] }).success, false);
  assert.equal(
    applyChangesInputSchema.safeParse({ changes: Array.from({ length: 41 }, () => create) }).success,
    false,
  );
  assert.equal(
    applyChangesInputSchema.safeParse({
      createFiles: [create],
      replaceFiles: [replace],
      deleteFiles: [remove],
    }).success,
    false,
  );
  assert.equal(
    applyChangesInputSchema.safeParse({ changes: JSON.stringify([create]) }).success,
    false,
  );
});
