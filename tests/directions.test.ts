import assert from "node:assert/strict";
import test from "node:test";

import { designBriefSchema, originalBriefSchema } from "../lib/design/brief.ts";
import { contrastRatio, parseColor } from "../lib/design/color.ts";
import { generateGlobalsCss } from "../lib/design/design-system.ts";
import { DIRECTION_IDS, DIRECTIONS, ITALIC_FAMILIES, expandOriginalBrief } from "../lib/design/directions.ts";
import { findCatalogFont } from "../lib/design/fonts.ts";

const rgb = (hex: string) => parseColor(hex)!;

function input(direction: (typeof DIRECTION_IDS)[number], accent: string) {
  const spec = DIRECTIONS[direction];
  return originalBriefSchema.parse({
    direction,
    rationale: "Fits the audience and the product.",
    brand: { name: "Volt", tagline: "Own your keys", voice: "blunt, confident" },
    accent,
    displayFont: spec.display.families[0]!.family,
    bodyFont: spec.body.families[0]!,
    signature: "Tilted render inside an accent frame",
    imagery: "Studio render of a matte object with accent rim light",
    sections: [
      { id: "hero", purpose: "Lead with the promise", block: "hero", variant: "split", surface: 1, composition: "copy left, render right", media: "render" },
      { id: "features", purpose: "Three reasons", block: "feature-cards", variant: "numbered", surface: 1, composition: "three numbered cards", media: null },
      { id: "story", purpose: "How it protects you", block: "feature-split", variant: null, surface: 2, composition: "copy left, render right", media: "render" },
      { id: "cta", purpose: "Ask for the download", block: "cta", variant: "panel", surface: 1, composition: "centered panel", media: null },
      { id: "footer", purpose: "Links", block: "footer", variant: null, surface: 2, composition: "brand and columns", media: null },
    ],
  });
}

test("every direction names catalog fonts in roles they support", () => {
  for (const id of DIRECTION_IDS) {
    const direction = DIRECTIONS[id];
    for (const { family } of direction.display.families) {
      const entry = findCatalogFont(family);
      assert.ok(entry, `${id}: display ${family} missing from the catalog`);
      assert.ok(entry.roles.includes("display") || entry.category !== "mono", `${id}: ${family} cannot be a display face`);
      if (direction.highlight === "italic") assert.ok(ITALIC_FAMILIES.has(family), `${id}: ${family} has no italic`);
    }
    for (const family of direction.body.families) {
      assert.ok(findCatalogFont(family)?.roles.includes("body"), `${id}: ${family} is not a body face`);
    }
    if (direction.mono) assert.equal(findCatalogFont(direction.mono)?.category, "mono");
  }
});

test("expanded directions are valid briefs with readable surfaces for any accent", () => {
  for (const id of DIRECTION_IDS) {
    for (const accent of ["#C8FF00", "#7A1F2B", "#3AA8FF", "#FFC22E", "#808080"]) {
      const { brief, problems } = expandOriginalBrief(input(id, accent));
      assert.deepEqual(problems, [], `${id} ${accent}`);
      designBriefSchema.parse(brief);
      assert.ok(contrastRatio(rgb(brief.colors.foreground), rgb(brief.colors.background)) >= 7, `${id} ${accent} body text`);
      assert.ok(contrastRatio(rgb(brief.colors.primaryForeground), rgb(brief.colors.primary)) >= 4.5, `${id} ${accent} primary`);
      assert.ok(contrastRatio(rgb(brief.colors.accentForeground), rgb(brief.colors.accent)) >= 4.5, `${id} ${accent} accent`);
      for (const surface of brief.colors.surfaces) {
        assert.ok(
          contrastRatio(rgb(surface.foreground), rgb(surface.background)) >= 4.5,
          `${id} ${accent} surface ${surface.name}: ${surface.foreground} on ${surface.background}`,
        );
      }
    }
  }
});

test("direction choices outside its lists are reported", () => {
  const { problems } = expandOriginalBrief({ ...input("kinetic", "#C8FF00"), displayFont: "Fraunces", bodyFont: "Anton" });
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /not one of the Kinetic contrast display fonts/);
});

test("direction styles reach the generated CSS", () => {
  const kinetic = expandOriginalBrief(input("kinetic", "#C8FF00")).brief;
  const anton = findCatalogFont("Anton")!;
  const body = findCatalogFont("Instrument Sans")!;
  const fonts = { display: { kind: "google" as const, entry: anton, weights: [400] }, body: { kind: "google" as const, entry: body, weights: [400] }, mono: null };
  const css = generateGlobalsCss(kinetic, fonts, { highlight: "color" });
  assert.match(css, /h1, h2, \.display-case \{\n\s+text-transform: uppercase;/);
  assert.match(css, /--display-split-vw: 7\.4vw;/);
  assert.match(css, /h3 \{\n\s+font-family: var\(--font-sans\);/);

  const editorial = expandOriginalBrief(input("editorial", "#1F4D3A")).brief;
  const serif = findCatalogFont("Instrument Serif")!;
  const italic = generateGlobalsCss(editorial, { ...fonts, display: { kind: "google", entry: serif, weights: [400], italic: true } }, { highlight: "italic" });
  assert.match(italic, /\.brand-highlight \{\n\s+font-style: italic;/);
  assert.doesNotMatch(italic, /text-transform: uppercase/);

  const wide = findCatalogFont("Rubik Mono One")!;
  assert.match(generateGlobalsCss(kinetic, { ...fonts, display: { kind: "google", entry: wide, weights: [400] } }, { highlight: "color" }), /h3 \{\n\s+font-family: var\(--font-sans\);/);
  assert.doesNotMatch(generateGlobalsCss(kinetic, { ...fonts, display: { kind: "google", entry: findCatalogFont("Bricolage Grotesque")!, weights: [600] } }, { highlight: "color" }), /h3 \{\n\s+font-family: var\(--font-sans\);/);

  const pop = expandOriginalBrief(input("pop", "#FF5A36")).brief;
  assert.match(generateGlobalsCss(pop, fonts, { highlight: "marker" }), /--marker: #FF5A36;/i);
});
