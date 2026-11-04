import assert from "node:assert/strict";
import test from "node:test";

import { buildApplyChangesFiles } from "../ai/tools/apply-changes-output.ts";

const passed = {
  status: "passed" as const,
  exitCode: 0,
  durationMs: 40,
  timedOut: false,
  outputTruncated: false,
};

const failed = {
  status: "failed" as const,
  exitCode: 2,
  durationMs: 60,
  timedOut: false,
  outputTruncated: false,
};

test("reports created and deleted files without validation noise", () => {
  const created = buildApplyChangesFiles(
    [{ path: "app/page.tsx", operation: "created", addedLines: 3, deletedLines: 0 }],
    [{ path: "app/page.tsx", after: "one\ntwo\nthree" }],
    { validation: passed, tscError: null },
  );
  assert.deepEqual(created, [
    {
      path: "app/page.tsx",
      status: "success",
      addedLines: 3,
      totalLines: 3,
    },
  ]);

  const deleted = buildApplyChangesFiles(
    [{ path: "app/old.tsx", operation: "deleted", addedLines: 0, deletedLines: 7 }],
    [{ path: "app/old.tsx", after: null }],
    { validation: passed, tscError: null },
  );
  assert.deepEqual(deleted, [
    { path: "app/old.tsx", status: "success", deletedLines: 7 },
  ]);
});

test("attaches each tsc error to its own file", () => {
  const tscError = [
    "TypeScript check exited with code 2. The source changes were preserved.",
    "app/page.tsx(2,4): error TS17002: Expected corresponding JSX closing tag.",
    "components/hero.tsx(1,1): error TS2304: Cannot find name 'x'.",
  ].join("\n");
  const files = buildApplyChangesFiles(
    [
      { path: "app/page.tsx", operation: "edited", addedLines: 1, deletedLines: 0 },
      { path: "components/hero.tsx", operation: "edited", addedLines: 1, deletedLines: 0 },
      { path: "app/layout.tsx", operation: "edited", addedLines: 1, deletedLines: 0 },
    ],
    [
      { path: "app/page.tsx", after: "one\ntwo\nthree" },
      { path: "components/hero.tsx", after: "hero" },
      { path: "app/layout.tsx", after: "layout" },
    ],
    { validation: failed, tscError },
  );

  assert.equal(files[0]?.validation?.status, "failed");
  assert.equal(
    files[0]?.tscError,
    "app/page.tsx(2,4): error TS17002: Expected corresponding JSX closing tag.",
  );
  assert.equal(
    files[1]?.tscError,
    "components/hero.tsx(1,1): error TS2304: Cannot find name 'x'.",
  );
  assert.equal(files[2]?.validation, undefined);
  assert.equal(files[2]?.tscError, undefined);
});

test("attaches unattributed and timeout errors to the first file", () => {
  const tscError =
    "TypeScript check exited with code 2. The source changes were preserved.\ncomponents/unrelated.tsx(4,1): error TS2304: Cannot find name 'x'.";
  const files = buildApplyChangesFiles(
    [{ path: "app/page.tsx", operation: "edited", addedLines: 1, deletedLines: 1 }],
    [{ path: "app/page.tsx", after: "one" }],
    { validation: failed, tscError },
  );

  assert.equal(files[0]?.validation?.status, "failed");
  assert.equal(files[0]?.tscError, tscError);

  const timeoutError = "TypeScript check timed out. The source changes were preserved.";
  const timedOut = buildApplyChangesFiles(
    [{ path: "app/page.tsx", operation: "edited", addedLines: 1, deletedLines: 1 }],
    [{ path: "app/page.tsx", after: "one" }],
    {
      validation: {
        status: "timed-out",
        exitCode: null,
        durationMs: 90_000,
        timedOut: true,
        outputTruncated: false,
      },
      tscError: timeoutError,
    },
  );
  assert.equal(timedOut[0]?.validation?.status, "timed-out");
  assert.equal(timedOut[0]?.tscError, timeoutError);
});
