import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FONT_CATALOG } from "../lib/design/fonts.ts";
import { lintSourceChange } from "../lib/design/lint.ts";

test("curated fonts exist in next/font with matching static weights", () => {
  const data = JSON.parse(
    readFileSync("node_modules/next/dist/compiled/@next/font/dist/google/font-data.json", "utf8"),
  ) as Record<string, { weights: string[] }>;
  for (const entry of FONT_CATALOG) {
    const record = data[entry.family];
    assert.ok(record, `${entry.family} is missing from next/font`);
    if (entry.variable) {
      assert.ok(record.weights.includes("variable"), `${entry.family} is not variable`);
    } else {
      for (const weight of entry.weights) {
        assert.ok(record.weights.includes(weight), `${entry.family} lacks ${weight}`);
      }
    }
  }
});

test("design lint flags raw colors, reference brands, copied headlines and claims on new lines only", () => {
  const before = "<div className=\"bg-zinc-900\">existing</div>";
  const after = [
    before,
    "<section className=\"bg-slate-950 text-white hover:bg-emerald-500/20 md:text-[#ff0000]\">",
    "<h2 className=\"font-heading text-2xl text-foreground bg-primary/10\">Controlled by you, secured by industry leaders</h2>",
    "<p>Rated the #1 most secure wallet with 100MM+ downloads on MetaMask</p>",
  ].join("\n");
  const violations = lintSourceChange({
    path: "components/hero.tsx",
    before,
    after,
    reference: {
      brands: ["metamask", "phantom"],
      headings: [
        "Controlled by you, secured by us",
        "100MM+ downloads across Google Play, the App Store, and Chrome Web Store",
      ],
    },
  });
  const kinds = violations.map((violation) => `${violation.line}:${violation.kind}:${violation.excerpt}`);
  assert.ok(kinds.some((entry) => entry.startsWith("2:raw-color:bg-slate-950")));
  assert.ok(kinds.some((entry) => entry.startsWith("2:raw-color:text-white")));
  assert.ok(kinds.some((entry) => entry.startsWith("2:raw-color:hover:bg-emerald-500/20")));
  assert.ok(kinds.some((entry) => entry.startsWith("2:raw-color:md:text-[#ff0000]")));
  assert.ok(kinds.some((entry) => entry.startsWith("3:copied-copy")));
  assert.ok(kinds.some((entry) => entry.startsWith("4:reference-brand")));
  assert.ok(kinds.some((entry) => entry.startsWith("4:copied-claim")));
  assert.ok(!kinds.some((entry) => entry.startsWith("1:")), "unchanged existing lines are not flagged");
  assert.ok(!kinds.some((entry) => entry.startsWith("3:raw-color")), "token classes are not flagged");
  assert.deepEqual(
    lintSourceChange({ path: "components/ui/button.tsx", before: null, after: "bg-zinc-900", reference: null }),
    [],
  );
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
    reference: null,
  });
  assert.deepEqual(
    violations.map((violation) => `${violation.line}:${violation.kind}`),
    ["1:invented-stat", "2:invented-stat", "3:invented-stat", "6:invented-stat", "7:invented-stat", "8:invented-stat"],
  );
});

test("design lint flags reworded reference headlines", () => {
  const reworded = lintSourceChange({
    path: "components/hero.tsx",
    before: null,
    after: "title=\"Your home for multi-chain crypto, perps, and predictions\"\ntitle=\"Trade every chain from one calm place\"",
    reference: { brands: ["phantom"], headings: ["Your home for trading crypto, predictions, perps, and more"] },
  });
  assert.deepEqual(reworded.map((violation) => `${violation.line}:${violation.kind}`), ["1:copied-copy"]);
});

test("design lint flags fabricated reviews and testimonial sections", () => {
  const created = lintSourceChange({
    path: "components/reviews.tsx",
    before: null,
    after: "<p className=\"font-bold\">DESHANT</p>\n<p className=\"text-xs\">Verified Subscriber · 07/10/2024</p>",
    reference: null,
  });
  assert.deepEqual(created.map((violation) => `${violation.line}:${violation.kind}`), ["1:fabricated-proof", "2:fabricated-proof"]);
  const endorsement = lintSourceChange({
    path: "components/security.tsx",
    before: null,
    after: "<p>Protected by Aether Shield Architecture · Audited by CertiK & OtterSec</p>\n<p>Secured by real-time threat interception</p>",
    reference: null,
  });
  assert.deepEqual(endorsement.map((violation) => `${violation.line}:${violation.kind}`), ["1:fabricated-proof"]);
  const edited = lintSourceChange({ path: "components/how-it-works.tsx", before: null, after: "<p>Pick your roast</p>", reference: null });
  assert.deepEqual(edited, []);
});

test("every catalog font has measured metrics and matching ranks similar faces first", async () => {
  const { FONT_METRICS, closestCatalogFonts } = await import("../lib/design/fonts.ts");
  for (const entry of FONT_CATALOG) assert.ok(FONT_METRICS[entry.family], `${entry.family} has no metrics`);
  const condensed = closestCatalogFonts({ family: "Ref", weight: 400, lower: 0.39, x: 0.7, cap: 0.7, serif: 1 }, "display", 3);
  assert.ok(condensed.some((match) => match.entry.width === "condensed"));
  const serif = closestCatalogFonts({ family: "Ref", weight: 400, lower: 0.5, x: 0.5, cap: 0.71, serif: 2.8 }, "display", 3);
  assert.ok(serif.every((match) => match.entry.category === "serif"));
});
