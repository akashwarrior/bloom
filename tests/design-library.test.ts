import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { referenceFrames } from "../ai/design/library/frames.ts";
import { lintSourceChange } from "../ai/design/lint.ts";

test("each curated selection has at most two bundled images", () => {
  assert.deepEqual(referenceFrames.none, []);
  for (const ids of Object.values(referenceFrames)) {
    assert.ok(ids.length <= 2);
    for (const id of ids) assert.ok(existsSync(path.join(import.meta.dirname, "../ai/design/library/images", id + ".webp")));
  }
});

test("page composition can use fluid type, custom grids and crops", () => {
  assert.deepEqual(lintSourceChange({ path: "app/page.tsx", before: null,
    after: '<section className="grid grid-cols-[2fr_3fr]"><h1 className="text-[clamp(3rem,8vw,8rem)]">Shop</h1><img className="object-[65%_center]" alt="Tin" /></section>' }), []);
});

test("hand-written widget roles are flagged in favor of ui-sdk; plain buttons, fields and links are not", () => {
  const kinds = (after: string, path = "components/hero.tsx") =>
    lintSourceChange({ path, before: null, after }).map((violation) => violation.kind);
  assert.deepEqual(kinds('<div role="dialog" aria-modal="true">Share</div>'), ["hand-rolled-ui"]);
  assert.deepEqual(kinds("<ul role={'listbox'}><li role=\"option\">One</li></ul>"), ["hand-rolled-ui"]);
  assert.match(lintSourceChange({ path: "components/tabs.tsx", before: null, after: '<div role="tablist">' })[0]!.fix, /ui-sdk's tabs component/);
  assert.deepEqual(kinds('<button className="rounded-full bg-primary px-4">Start</button>'), []);
  assert.deepEqual(kinds('<input type="email" className="h-10" />'), []);
  assert.deepEqual(kinds('<a href="/start" className="inline-flex rounded-full bg-primary px-5 py-2">Start</a>'), []);
  assert.deepEqual(kinds('<Button render={<a href="/start" />}>Start</Button>'), []);
  assert.deepEqual(kinds('<div role="img" aria-label="Chart">'), []);
  assert.deepEqual(kinds('<Field><FieldLabel>Email</FieldLabel><Input placeholder="you@company.com" /></Field>'), []);
});

test("certifications and accuracy claims nobody provided are flagged", () => {
  const lint = (line: string) => lintSourceChange({ path: "components/close.tsx", before: null, after: `<p>${line}</p>` }).map((violation) => violation.kind);
  assert.ok(lint("No credit card required · SOC2 Type II Certified").includes("invented-stat"));
  assert.ok(lint("99.9% accuracy on technical terms").includes("invented-stat"));
  assert.ok(lint("Zero training on client transcripts (SOC2 Type II verified)").includes("invented-stat"));
  assert.ok(lint("Join product teams saving 8+ hours every week").includes("invented-stat"));
  assert.deepEqual(lint("Notes land in your tracker after every call"), []);
});
