import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTypeScriptErrorLocations,
  skippedTypeScriptValidation,
  summarizeTypeScriptValidation,
  typeScriptErrorTextFor,
  unavailableTypeScriptValidation,
} from "../lib/runtime/typecheck-diagnostics.ts";

test("reports a passing typecheck without copying command output", () => {
  assert.deepEqual(
    summarizeTypeScriptValidation({
      exitCode: 0,
      stdout: "verbose success output",
      stderr: "",
      durationMs: 42,
      timedOut: false,
      outputTruncated: false,
    }),
    {
      validation: {
        status: "passed",
        exitCode: 0,
        durationMs: 42,
        timedOut: false,
        outputTruncated: false,
      },
      tscError: null,
    },
  );
});

test("returns bounded, deduplicated tsc errors as non-fatal diagnostics", () => {
  const repeated =
    "app/page.tsx(2,4): error TS2307: Cannot find module './hero' or its corresponding type declarations.";
  const result = summarizeTypeScriptValidation({
    exitCode: 1,
    stdout: `${repeated}\n${repeated}\nFound 1 error in 1 file.`,
    stderr: "unrelated tsc banner",
    durationMs: 120,
    timedOut: false,
    outputTruncated: true,
  });

  assert.equal(result.validation.status, "failed");
  assert.equal(result.validation.outputTruncated, true);
  assert.match(result.tscError ?? "", /source changes were preserved/);
  assert.equal(result.tscError?.match(/Cannot find module/g)?.length, 1);
  assert.doesNotMatch(result.tscError ?? "", /unrelated tsc banner/);
  assert.ok((result.tscError?.length ?? 0) <= 6_000);
});

test("extracts one location per file and scopes diagnostics to a file", () => {
  const diagnostics = [
    "TypeScript check exited with code 2. The source changes were preserved.",
    "app/page.tsx(385,9): error TS17002: Expected corresponding JSX closing tag for 'div'.",
    "app/page.tsx(385,9): error TS17002: duplicate diagnostic.",
    "./components/hero.tsx(12,3): error TS2304: Cannot find name 'x'.",
  ].join("\n");

  assert.deepEqual(parseTypeScriptErrorLocations(diagnostics), [
    { path: "app/page.tsx", line: 385, column: 9 },
    { path: "components/hero.tsx", line: 12, column: 3 },
  ]);
  assert.deepEqual(parseTypeScriptErrorLocations(null), []);
  const perFileDiagnostics = [
    "app/page.tsx(385,9): error TS17002: Expected corresponding JSX closing tag for 'div'.",
    "components/hero.tsx(12,3): error TS2304: Cannot find name 'x'.",
  ].join("\n");
  assert.equal(
    typeScriptErrorTextFor(perFileDiagnostics, "app/page.tsx"),
    "app/page.tsx(385,9): error TS17002: Expected corresponding JSX closing tag for 'div'.",
  );
  assert.equal(typeScriptErrorTextFor(perFileDiagnostics, "app/layout.tsx"), null);
});

test("represents skipped and unavailable checks without throwing", () => {
  assert.equal(skippedTypeScriptValidation().validation.status, "skipped");
  const unavailable = unavailableTypeScriptValidation(
    new Error("container unavailable"),
  );
  assert.equal(unavailable.validation.status, "unavailable");
  assert.match(unavailable.tscError ?? "", /changes were preserved/);
  assert.match(unavailable.tscError ?? "", /container unavailable/);
});
