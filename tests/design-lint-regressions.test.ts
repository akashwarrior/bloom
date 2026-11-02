import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";

import { lintSourceChange } from "../lib/design/lint.ts";
import { buildPageDna, compareDna } from "../lib/design/dna.ts";

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

test("installed optional blocks satisfy the same final source audit", () => {
  const directory = new URL("../templates/blocks/", import.meta.url);
  for (const file of readdirSync(directory).filter((file) => /\.(?:tsx|ts)$/.test(file))) {
    assert.deepEqual(lintSourceChange({
      path: `components/blocks/${file}`,
      before: null,
      after: readFileSync(new URL(file, directory), "utf8"),
      reference: null,
    }), [], file);
  }
});

test("surface verification clusters the brief with the same tolerance as the screenshot", () => {
  const preview = buildPageDna({ frames: [], profile: null, pageHeight: 4000, viewportHeight: 1000 });
  preview.surfaceColors = [{ color: "#FFFFFF", share: 0.7, light: true }, { color: "#121316", share: 0.3, light: false }];
  const gaps = (surfaceColors: string[]) => compareDna({
    preview, previewProfile: null, anchor: null,
    expected: { theme: "mixed", surfaceColors, displaySize: null, displayFamily: null, bodyFamily: null },
  });
  assert.ok(!gaps(["#F5F3FF", "#FFFFFF", "#121316", "#FAF8FF"]).some((gap) => gap.message.includes("Color-blocking")));
  assert.ok(gaps(["#FFFFFF", "#121316", "#FF0000", "#00FF00"]).some((gap) => gap.message.includes("Color-blocking")));
});

test("invented awards and accolades are flagged as fabricated proof", () => {
  for (const line of ["<span>D&AD Black Pencil 2025</span>", "<li>Cannes Grand Prix 2024</li>", "<p>An award-winning studio</p>", "<p>ADC Studio of the Year</p>", "<p>Awwwards site of the day</p>"]) {
    assert.ok(lintSourceChange({ path: "components/hero.tsx", before: null, after: line, reference: null }).some((violation) => violation.kind === "fabricated-proof"), line);
  }
  assert.deepEqual(lintSourceChange({ path: "components/hero.tsx", before: null, after: "<p>Studio work for founders who care about craft</p>", reference: null }), []);
});
