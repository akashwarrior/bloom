import assert from "node:assert/strict";
import test from "node:test";

import { lintSourceChange } from "../lib/design/lint.ts";

test("fractional layout utilities are not mistaken for customer ratings", () => {
  const after = 'const crop = "aspect-[4/5] w-4/5";';
  assert.deepEqual(lintSourceChange({ path: "components/hero.tsx", before: null, after, reference: null }), []);
  const visibleRating = '<p>Our customers rate us 4/5</p>';
  assert.ok(lintSourceChange({ path: "components/hero.tsx", before: null, after: visibleRating, reference: null }).some((violation) => violation.kind === "invented-stat"));
});

test("invented claims are caught in JSX text that wraps onto its own line", () => {
  const after = ["<p className=\"text-lead\">", "  Join millions of traders worldwide using our wallet.", "</p>", "<p>", "  Fund your wallet across 160+ countries.", "</p>"].join("\n");
  const violations = lintSourceChange({ path: "components/cta.tsx", before: null, after, reference: null });
  assert.deepEqual(violations.map((violation) => violation.line), [2, 5]);
  const code = ["const items = [", "  default:", "  return value", "];"].join("\n");
  assert.deepEqual(lintSourceChange({ path: "components/cta.tsx", before: null, after: code, reference: null }), []);
});

test("decorative glow blobs and glass panels are rejected in page code", () => {
  const glow = '<div aria-hidden className="absolute -top-40 left-1/2 h-130 w-240 -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />';
  assert.ok(lintSourceChange({ path: "app/page.tsx", before: null, after: glow, reference: null }).some((violation) => violation.kind === "decorative-glow"));
  const glass = '<header className="sticky top-0 bg-background/85 backdrop-blur-xl">';
  assert.ok(lintSourceChange({ path: "components/site-header.tsx", before: null, after: glass, reference: null }).some((violation) => violation.kind === "glassmorphism"));
  assert.deepEqual(lintSourceChange({ path: "components/panel.tsx", before: null, after: '<div className="rounded-full bg-primary/20" />', reference: null }), []);
  assert.deepEqual(lintSourceChange({ path: "components/panel.tsx", before: null, after: '<div className="bg-background backdrop-blur-xl" />', reference: null }), []);
});

test("invented awards and accolades are flagged as fabricated proof", () => {
  for (const line of ["<span>D&AD Black Pencil 2025</span>", "<li>Cannes Grand Prix 2024</li>", "<p>An award-winning studio</p>", "<p>ADC Studio of the Year</p>", "<p>Awwwards site of the day</p>"]) {
    assert.ok(lintSourceChange({ path: "components/hero.tsx", before: null, after: line, reference: null }).some((violation) => violation.kind === "fabricated-proof"), line);
  }
  assert.deepEqual(lintSourceChange({ path: "components/hero.tsx", before: null, after: "<p>Studio work for founders who care about craft</p>", reference: null }), []);
});
