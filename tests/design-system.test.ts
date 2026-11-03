import assert from "node:assert/strict";
import test from "node:test";

import { lintSourceChange } from "../ai/design/lint.ts";

test("design lint checks new lines only, and leaves colors to the project's own theme", () => {
  const before = "<p>Trusted by 40,000+ teams</p>";
  const after = [
    before,
    "<section className=\"bg-slate-950 text-white hover:bg-emerald-500/20 md:text-[#ff0000] bg-brass/10\">",
    "<p>Rated 4.9 out of 5 stars</p>",
  ].join("\n");
  const violations = lintSourceChange({ path: "components/hero.tsx", before, after });
  // The existing line and the color classes are left alone; only the new claim is reported.
  assert.deepEqual([...new Set(violations.map((violation) => violation.line))], [3]);
  assert.ok(violations.some((violation) => violation.kind === "fabricated-proof"));
});

test("design lint flags invented marketing stats but not UI mockup balances", () => {
  const violations = lintSourceChange({
    path: "components/proof.tsx",
    before: null,
    after: [
      "<p>Trusted by 20M+ traders worldwide</p>",
      "{ name: \"Ethereum\", tvl: \"$48.2B\" },",
      "<span>Earn up to 4.5% APY on stablecoins</span>",
      "<span className=\"text-5xl\">$24,592.18</span>",
      "<p>Swap tokens across every major network in seconds.</p>",
      "attribution=\"Trusted by over 250,000 active DeFi traders\"",
      "<p>Join millions of sovereign individuals who protect their wealth</p>",
      "description: \"Best execution across 50+ DEXs and leading EVM networks\",",
      "<ListRow title=\"Ethereum\" subtitle=\"2.41 ETH\" value=\"$7,812.04\" />",
    ].join("\n"),
  });
  assert.deepEqual(
    violations.map((violation) => `${violation.line}:${violation.kind}`),
    ["1:invented-stat", "2:invented-stat", "3:invented-stat", "6:invented-stat", "7:invented-stat", "8:invented-stat"],
  );
});

test("design lint flags fabricated reviews and testimonial sections", () => {
  const created = lintSourceChange({
    path: "components/reviews.tsx",
    before: null,
    after: "<p className=\"font-bold\">DESHANT</p>\n<p className=\"text-xs\">Verified Subscriber · 07/10/2024</p>",
  });
  assert.deepEqual(created.map((violation) => `${violation.line}:${violation.kind}`), ["1:fabricated-proof", "2:fabricated-proof"]);
  const endorsement = lintSourceChange({
    path: "components/security.tsx",
    before: null,
    after: "<p>Protected by Aether Shield Architecture · Audited by CertiK & OtterSec</p>\n<p>Secured by real-time threat interception</p>",
  });
  assert.deepEqual(endorsement.map((violation) => `${violation.line}:${violation.kind}`), ["1:fabricated-proof"]);
  const edited = lintSourceChange({ path: "components/how-it-works.tsx", before: null, after: "<p>Pick your roast</p>" });
  assert.deepEqual(edited, []);
});
