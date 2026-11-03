import assert from "node:assert/strict";
import test from "node:test";

import {
  browserDiagnosticKey,
  compactDiagnosticMessage,
  isDevHmrDiagnostic,
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

test("development HMR transport failures are not design diagnostics", () => {
  assert.equal(isDevHmrDiagnostic({
    message: "WebSocket connection to 'ws://127.0.0.1:32786/_next/hmr?id=abc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE",
    url: "http://127.0.0.1:32786/_next/static/chunks/client.js",
  }), true);
  assert.equal(isDevHmrDiagnostic({
    message: "HTTP 404 Not Found",
    url: "http://127.0.0.1:32786/_next/webpack-hmr",
  }), true);
  assert.equal(isDevHmrDiagnostic({
    message: "Failed to load resource",
    url: "http://127.0.0.1:32786/api/checkout",
  }), false);
});
