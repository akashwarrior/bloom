import assert from "node:assert/strict";
import test from "node:test";

import { applyPatch } from "diff";

import { normalizePatch } from "../lib/runtime/patch-normalize.ts";

const content = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-heading: var(--font-sans);
    --font-sans: var(--font-sans);
    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
}
`;

// Exactly the shape models emit: wrong hunk counts, a bare empty context line,
// and a trailing newline that must not be counted as context.
const patch = `@@ -1,4 +1,27 @@
 @import "tailwindcss";
 @import "tw-animate-css";
 @import "shadcn/tailwind.css";
 
+@font-face {
+  font-family: 'MMPolyVariable';
+  src: url('/bloom-reference-assets/r-bf8306340217faa5/font-1-1') format('woff2');
+  font-weight: 400;
+  font-style: normal;
+  font-display: swap;
+}
+
 @custom-variant dark (&:is(.dark *));
@@ -7,2 +30,5 @@
     --font-heading: var(--font-sans);
     --font-sans: var(--font-sans);
+    --font-poly: 'MMPolyVariable', sans-serif;
+    --font-sans-var: 'MMSansVariable', sans-serif;
+    --font-euclid: 'MMEuclidCircularB', sans-serif;
     --color-sidebar-ring: var(--sidebar-ring);
`;

test("recounts hunk headers from the body", () => {
  const normalized = normalizePatch(patch);
  const headers = normalized
    .split("\n")
    .filter((line) => line.startsWith("@@"));
  assert.deepEqual(headers, ["@@ -1,5 +1,13 @@", "@@ -7,3 +30,6 @@"]);
});

test("normalizes bare empty context lines to single-space prefixes", () => {
  const normalized = normalizePatch(patch);
  assert.ok(normalized.includes(` @import "shadcn/tailwind.css";\n \n+@font-face`));
});

test("applies cleanly despite wrong counts and a trailing newline", () => {
  const result = applyPatch(content, normalizePatch(patch), {
    fuzzFactor: 0,
  });
  assert.notEqual(result, false);
  assert.ok(typeof result === "string" && result.includes(`    --font-poly: 'MMPolyVariable', sans-serif;`));
});