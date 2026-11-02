import assert from "node:assert/strict";
import test from "node:test";

import { validateSourceTextEscaping } from "../ai/source-change-policy.ts";

test("accepts decoded TypeScript and JSX source", () => {
  assert.doesNotThrow(() =>
    validateSourceTextEscaping([
      {
        path: "components/hero.tsx",
        text: '"use client";\nimport Link from "next/link";\nexport function Hero() { return <Link href="/">Home</Link>; }',
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

test("a file holding a whole page of components is recognised; ordinary files are not", async () => {
  const { crowdedComponentFile } = await import("../ai/source-change-policy.ts");
  const component = (name: string, lines: number) => `function ${name}() {\n  return (\n${Array.from({ length: lines }, () => "    <p>line</p>").join("\n")}\n  )\n}\n`;
  const page = `"use client"\n\n${component("Header", 60)}\n${component("Hero", 90)}\nconst Footer = () => <footer />\n\nexport default ${component("Page", 80)}`;
  assert.deepEqual(crowdedComponentFile("components/landing.tsx", page), { lines: page.split("\n").length, components: 4 });
  assert.equal(crowdedComponentFile("components/hero.tsx", `export ${component("Hero", 260)}`), null);
  assert.equal(crowdedComponentFile("components/small.tsx", `${component("A", 5)}${component("B", 5)}${component("C", 5)}`), null);
  assert.equal(crowdedComponentFile("lib/data.ts", page), null);
  assert.equal(crowdedComponentFile("components/gone.tsx", null), null);
});
