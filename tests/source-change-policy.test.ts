import assert from "node:assert/strict";
import test from "node:test";

import { validateSourceTextEscaping } from "../ai/source-change-policy.ts";

test("accepts decoded TypeScript and JSX source", () => {
  assert.doesNotThrow(() =>
    validateSourceTextEscaping([
      {
        path: "components/hero.tsx",
        text: '"use client";\nexport function Hero() { return <a href="/">Home</a>; }',
      },
    ]),
  );
});

test("rejects source whose quotes were escaped a second time", () => {
  assert.throws(
    () =>
      validateSourceTextEscaping([
        {
          path: "components/hero.tsx",
          text: String.raw`\"use client\";
export function Hero() { return <a href=\"/\" className=\"hero\">Home</a>; }`,
        },
      ]),
    /already JSON-decoded/,
  );
});

test("rejects an import statement wrapped in literal quotes", () => {
  assert.throws(
    () =>
      validateSourceTextEscaping([
        {
          path: "components/header.tsx",
          text: `"import React, { useState } from 'react';\nimport Link from "next/link";`,
        },
      ]),
    /wrapped in literal quotes/,
  );
});

test("accepts a normal import statement without extra wrapping", () => {
  assert.doesNotThrow(() =>
    validateSourceTextEscaping([
      {
        path: "components/header.tsx",
        text: `import React, { useState } from 'react';\nimport Link from "next/link";`,
      },
    ]),
  );
});
