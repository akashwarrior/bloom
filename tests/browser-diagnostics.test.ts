import assert from "node:assert/strict";
import test from "node:test";

import {
  browserDiagnosticKey,
  compactDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from "../lib/runtime/browser-diagnostics.ts";

test("browser diagnostics retain useful detail without credentials or query secrets", () => {
  assert.equal(
    sanitizeDiagnosticUrl(
      "https://user:password@example.com/assets/app.js?token=secret#stack",
    ),
    "https://example.com/assets/app.js",
  );
  assert.equal(
    compactDiagnosticMessage("  Failed\n   to load\tmodule  "),
    "Failed to load module",
  );
});

test("browser diagnostic keys distinguish the concrete failing request", () => {
  const base = {
    kind: "http" as const,
    severity: "error" as const,
    status: 404,
    message: "Not Found",
  };

  assert.notEqual(
    browserDiagnosticKey({ ...base, url: "https://example.com/a.js" }),
    browserDiagnosticKey({ ...base, url: "https://example.com/b.js" }),
  );
});
