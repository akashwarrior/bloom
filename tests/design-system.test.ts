import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { designBriefSchema, type DesignBrief } from "../lib/design/brief.ts";
import {
  generateDesignDoc,
  generateGlobalsCss,
  generateLayout,
  isReplaceableLayout,
  patchButtonComponent,
  patchUtilsFile,
  toneFor,
} from "../lib/design/design-system.ts";
import { contrastRatio, parseColor } from "../lib/design/color.ts";
import { FONT_CATALOG, findCatalogFont, nextFontExportName, weightsFor } from "../lib/design/fonts.ts";
import { lintSourceChange } from "../lib/design/lint.ts";

const brief: DesignBrief = designBriefSchema.parse({
  anchor: { url: "https://metamask.io/", keep: "color-blocked full-bleed sections, giant display headline, centered phone surface" },
  traits: [{ url: "https://phantom.com/", trait: "rounded hero media card inset from the page edge" }],
  brand: { name: "Lumen", tagline: "Self-custody that feels effortless", voice: "plainspoken, confident" },
  theme: "mixed",
  colors: {
    background: "#FFFFFF",
    foreground: "#0A0A0A",
    primary: "#0A0A0A",
    primaryForeground: "#FFFFFF",
    accent: "#FF6A3D",
    accentForeground: "#0A0A0A",
    muted: "#F2F2EE",
    mutedForeground: "#55554F",
    border: "#E2E2DC",
    surfaces: [
      { name: "hero", background: "#0F3D2E", foreground: "#E8FFD0" },
      { name: "product", background: "#E8FFD0", foreground: "#0F3D2E" },
      { name: "features", background: "#D6ECFF", foreground: "#1A0B5C" },
    ],
  },
  typography: {
    display: { family: "Dela Gothic One", weight: 400, sizePx: 150, lineHeight: 0.95, tracking: -0.01, uppercase: true },
    heading: { sizePx: 64, weight: 400 },
    body: { family: "Hanken Grotesk", weight: 400, sizePx: 17 },
    mono: null,
  },
  shape: { cardRadiusPx: 32, buttonShape: "pill", shadows: "none", borders: false },
  layout: { contentWidthPx: 1440, sectionPaddingPx: 128 },
  signature: "A giant stacked uppercase headline over a full-bleed deep green hero",
  imagery: "glossy 3D objects on flat surface-colored backgrounds",
  sections: [
    { id: "hero", purpose: "Promise and primary download action", block: "hero", variant: "centered", surface: 1, anchorFrame: 1, composition: "centered stacked display headline, pill CTA below", media: null },
    { id: "product", purpose: "Show the wallet app", block: "feature-split", variant: null, surface: 2, anchorFrame: 2, composition: "centered phone mockup with headline overlapping", media: "phone mockup" },
    { id: "features", purpose: "Four feature tiles", block: "bento", variant: null, surface: 3, anchorFrame: 3, composition: "2x2 saturated bento tiles around a central phone", media: "3D object per tile" },
  ],
});

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
  assert.equal(nextFontExportName("Source Serif 4"), "Source_Serif_4");
  assert.deepEqual(weightsFor(findCatalogFont("Space Mono")!, [400, 650]), ["400", "700"]);
});

test("design system generator emits tokens, fonts, and a locked theme", () => {
  const fonts = {
    display: { kind: "google" as const, entry: findCatalogFont("Dela Gothic One")!, weights: [400] },
    body: { kind: "google" as const, entry: findCatalogFont("Hanken Grotesk")!, weights: [400, 600] },
    mono: null,
  };
  const css = generateGlobalsCss(brief, fonts);
  assert.match(css, /bloom:design-system/);
  assert.match(css, /--surface-2: #E8FFD0;/);
  assert.match(css, /--color-surface-3-foreground: var\(--surface-3-foreground\);/);
  assert.match(css, /--text-display: clamp\(3rem, 10.42vw, 9.375rem\);/);
  assert.match(css, /--radius-button-value: 9999px;/);
  assert.match(css, /--font-display: var\(--font-display-face\)/);

  const layout = generateLayout(brief, fonts, { toaster: true, tooltip: true });
  assert.match(layout, /import \{ Dela_Gothic_One, Hanken_Grotesk \} from "next\/font\/google"/);
  assert.match(layout, /Dela_Gothic_One\(\{ subsets: \["latin"\], variable: "--font-display-face", display: "swap", weight: \["400"\] \}\)/);
  assert.match(layout, /forcedTheme="light"/);
  assert.match(layout, /<Toaster \/>/);

  assert.match(css, /--text-headline: clamp\(/);
  assert.match(css, /@utility surface-2 \{\n  --canvas: var\(--surface-2\);/);
  assert.match(css, /@utility tone-base \{/);
  assert.match(css, /--color-ink-muted: var\(--ink-muted\);/);
  assert.match(css, /@keyframes marquee/);
  assert.match(css, /--color-on-chart: var\(--on-chart\);/);

  const doc = generateDesignDoc(brief, fonts);
  assert.match(doc, /bg-surface-1 text-surface-1-foreground/);
  assert.match(doc, /adapts anchor frame 2/);
  assert.match(doc, /feature-split block/);

  assert.equal(isReplaceableLayout("import { Geist } from \"next/font/google\"\nexport default function RootLayout() { return <ThemeProvider /> }"), true);
  assert.equal(isReplaceableLayout("export default function RootLayout() { return <Navbar /> }"), false);
  const button = patchButtonComponent("x \"rounded-lg border border-transparent bg-clip-padding text-sm\" y\n        \"icon-lg\": \"size-9\",\n");
  assert.ok(button?.includes("rounded-button border"));
  assert.ok(button?.includes("\"2xl\": \"h-14"));
});

test("contextual tones keep actions and highlights readable on every surface", () => {
  const rgb = (hex: string) => parseColor(hex)!;
  const dark = toneFor(brief, "#0F3D2E", "#E8FFD0", "#B5CBA4");
  assert.notEqual(dark.action, "#0A0A0A", "the near-black primary is invisible on a dark surface");
  assert.ok(contrastRatio(rgb(dark.action), rgb("#0F3D2E")) >= 3);
  assert.ok(contrastRatio(rgb(dark.actionForeground), rgb(dark.action)) >= 4.5);
  assert.ok(contrastRatio(rgb(dark.highlight), rgb("#0F3D2E")) >= 3);
  const light = toneFor(brief, "#FFFFFF", "#0A0A0A", "#55554F");
  assert.equal(light.action, "#0A0A0A");
  assert.ok(contrastRatio(rgb(light.highlight), rgb("#FFFFFF")) >= 3);
});

test("cn() patch teaches tailwind-merge the design-system text sizes", () => {
  const starter = "import { clsx, type ClassValue } from \"clsx\"\nimport { twMerge } from \"tailwind-merge\"\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs))\n}\n";
  const patched = patchUtilsFile(starter);
  assert.ok(patched?.includes("extendTailwindMerge"));
  assert.ok(patched?.includes("\"headline\""));
  assert.equal(patchUtilsFile(patched), null);
});

test("design lint flags raw colors, reference brands, copied headlines and claims on new lines only", () => {
  const before = "<div className=\"bg-zinc-900\">legacy</div>";
  const after = [
    before,
    "<section className=\"bg-slate-950 text-white hover:bg-emerald-500/20 md:text-[#ff0000]\">",
    "<h2 className=\"font-display text-title text-surface-2-foreground bg-primary/10\">Controlled by you, secured by industry leaders</h2>",
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
  assert.ok(!kinds.some((entry) => entry.startsWith("1:")), "unchanged legacy lines are not flagged");
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
      "<span className=\"text-display\">$24,592.18</span>",
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
  const violations = lintSourceChange({
    path: "components/hero.tsx",
    before: null,
    after: "title=\"Your home for multi-chain crypto, perps, and predictions\"\ntitle=\"Trade every chain from one calm place\"",
    reference: { brands: ["phantom"], headings: ["Your home for trading crypto, predictions, perps, and more"], ownBrand: "Apex" },
  });
  assert.deepEqual(violations.map((violation) => `${violation.line}:${violation.kind}`), ["1:copied-copy"]);
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

test("design lint flags blocks wrapped in Section or Container", () => {
  const nested = lintSourceChange({
    path: "components/origins.tsx",
    before: null,
    after: "<Section id=\"origins\" surface={4}>\n  <Container>\n    <Bento surface={4} tiles={[]} />\n  </Container>\n</Section>",
    reference: null,
  });
  assert.deepEqual(nested.map((violation) => `${violation.line}:${violation.kind}`), ["3:nested-block"]);
  const direct = lintSourceChange({ path: "components/origins.tsx", before: null, after: "<Bento surface={4} tiles={[]} />", reference: null });
  assert.deepEqual(direct, []);
});

test("design lint catches short reference headlines with the brand swapped", () => {
  const violations = lintSourceChange({
    path: "components/cta.tsx",
    before: null,
    after: "<h2>Get started. Download Aether.</h2>\n<h2>Start trading in minutes</h2>",
    reference: { brands: ["phantom"], headings: ["Get started. Download Phantom."], ownBrand: "Aether" },
  });
  assert.deepEqual(violations.map((violation) => `${violation.line}:${violation.kind}`), ["1:copied-copy"]);
});

test("every catalog font has measured metrics and matching ranks similar faces first", async () => {
  const { FONT_METRICS, closestCatalogFonts } = await import("../lib/design/fonts.ts");
  for (const entry of FONT_CATALOG) assert.ok(FONT_METRICS[entry.family], `${entry.family} has no metrics`);
  const condensed = closestCatalogFonts({ family: "Ref", weight: 400, lower: 0.39, x: 0.7, cap: 0.7, serif: 1 }, "display", 3);
  assert.ok(condensed.some((match) => match.entry.width === "condensed"));
  const serif = closestCatalogFonts({ family: "Ref", weight: 400, lower: 0.5, x: 0.5, cap: 0.71, serif: 2.8 }, "display", 3);
  assert.ok(serif.every((match) => match.entry.category === "serif"));
});
