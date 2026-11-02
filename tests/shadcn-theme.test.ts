import assert from "node:assert/strict";
import test from "node:test";

import { decodePreset } from "shadcn/preset";

import { themedBriefSchema, type DesignBrief } from "../lib/design/brief.ts";
import { repairContrast } from "../lib/design/brief-checks.ts";
import { contrastRatio, parseColor, parseOklch, toHex } from "../lib/design/color.ts";
import { generateGlobalsCss, patchButtonComponent, patchUtilsFile } from "../lib/design/design-system.ts";
import { findCatalogFont } from "../lib/design/fonts.ts";
import {
  briefFromTheme,
  compatibleShadcnTheme,
  randomShadcnTheme,
  shadcnFontFamily,
  shadcnPresetCode,
  type ResolvedShadcnTheme,
} from "../lib/design/shadcn-theme.ts";
import { PRESET_FONTS } from "shadcn/preset";

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test("random presets follow shadcn create's randomize biases", () => {
  const random = seeded(7);
  for (let index = 0; index < 400; index += 1) {
    const theme = randomShadcnTheme(random);
    assert.notEqual(theme.baseColor, "gray");
    if (theme.style === "lyra") {
      assert.equal(theme.font, "jetbrains-mono");
      assert.equal(theme.radius, "none");
    }
    if (theme.style === "rhea") assert.notEqual(theme.radius, "large");
    if (theme.theme === "blue") assert.ok(["orange", "yellow"].includes(theme.chartColor));
  }
});

test("preset codes round-trip through shadcn's decoder", () => {
  const theme = randomShadcnTheme(seeded(3));
  const decoded = decodePreset(shadcnPresetCode(theme))!;
  for (const key of ["style", "baseColor", "theme", "chartColor", "font", "fontHeading", "iconLibrary", "radius"] as const) {
    assert.equal(decoded[key], theme[key]);
  }
});

test("oklch values from shadcn themes convert to sRGB", () => {
  assert.equal(toHex(parseOklch("oklch(1 0 0)")!), "#FFFFFF");
  const blue = parseOklch("oklch(0.546 0.245 262.881)")!;
  const expected = parseColor("#155DFC")!;
  for (const channel of ["r", "g", "b"] as const) assert.ok(Math.abs(blue[channel] - expected[channel]) <= 2);
  assert.equal(parseOklch("#ffffff"), null);
});

test("every shadcn create font resolves to a catalog font", () => {
  for (const font of PRESET_FONTS) assert.ok(findCatalogFont(shadcnFontFamily(font)), font);
});

const resolved: ResolvedShadcnTheme = {
  code: "b0",
  vars: {
    background: "#FFFFFF",
    foreground: "#0C0A09",
    primary: "#155DFC",
    "primary-foreground": "#EFF6FF",
    muted: "#F5F5F4",
    "muted-foreground": "#79716B",
    border: "#E7E5E4",
  },
  radiusPx: 14,
  chart: ["#FFD230", "#FD9A00", "#E17100", "#BB4D00", "#973C00"],
  iconImport: 'import { ArrowRight } from "lucide-react"',
};

const themed = themedBriefSchema.parse({
  anchor: { url: "https://library.bloom/frames", keep: "art-stage hero with one product card" },
  traits: [],
  brand: { name: "Tidewell", tagline: "Notes that stay in the room", voice: "calm, precise" },
  shadcn: { style: "maia", baseColor: "stone", theme: "blue", chartColor: "amber", font: "inter", fontHeading: "playfair-display", iconLibrary: "lucide", radius: "large", mode: "light" },
  surfaces: [
    { name: "hero", role: "background" },
    { name: "proof", role: "inverse" },
    { name: "close", role: "chart" },
  ],
  typography: {
    display: { weight: 400, sizePx: 88, lineHeight: 1, tracking: -0.02, uppercase: false },
    heading: { sizePx: 48, weight: 400 },
    body: { weight: 400, sizePx: 17 },
  },
  layout: { contentWidthPx: 1280, sectionPaddingPx: 120 },
  signature: "A watercolor estuary panel holding one meeting summary card",
  imagery: "Text-free watercolor estuaries at dusk, soft paper grain",
  sections: [
    { id: "hero", purpose: "Introduce the product", block: "custom", variant: null, surface: 1, composition: "Art panel edge to edge with one card", media: "watercolor estuary", anchorFrame: 1 },
    { id: "proof", purpose: "Show the product working", block: "custom", variant: null, surface: 2, composition: "Two cards side by side", media: null, anchorFrame: 3 },
    { id: "footer", purpose: "Close the page", block: "custom", variant: null, surface: 3, composition: "Statement and links", media: null, anchorFrame: null },
  ],
});

test("a themed brief takes its colors, fonts and shape from the shadcn theme", () => {
  const brief = briefFromTheme(themed, resolved);
  assert.equal(brief.colors.primary, "#155DFC");
  assert.equal(brief.colors.accent, "#E17100");
  assert.deepEqual(brief.colors.surfaces.map((surface) => surface.background), ["#FFFFFF", "#0C0A09", "#E17100"]);
  assert.equal(brief.colors.surfaces[1]!.foreground, "#FFFFFF");
  assert.equal(brief.theme, "mixed");
  assert.equal(brief.typography.display.family, "Playfair Display");
  assert.equal(brief.typography.body.family, "Inter");
  assert.equal(brief.shape.cardRadiusPx, 28);
  const css = generateGlobalsCss(brief, {
    display: { kind: "google", entry: findCatalogFont("Playfair Display")!, weights: [400] },
    body: { kind: "google", entry: findCatalogFont("Inter")!, weights: [400] },
    mono: null,
  }, { chart: resolved.chart, radiusPx: resolved.radiusPx });
  assert.match(css, /--chart-1: #FFD230;/);
  assert.match(css, /--radius: 14px;/);
});

test("contrast below WCAG is repaired instead of rejected", () => {
  const brief = briefFromTheme(themed, resolved);
  const weak: DesignBrief = { ...brief, colors: { ...brief.colors, accent: "#6366F1", accentForeground: "#FFFFFF", mutedForeground: "#B0ABA6" } };
  const { brief: repaired, notes } = repairContrast(weak);
  const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!);
  assert.ok(ratio(repaired.colors.accentForeground, repaired.colors.accent) >= 4.5);
  assert.ok(ratio(repaired.colors.mutedForeground, repaired.colors.background) >= 4.5);
  assert.equal(notes.length, 2);
  assert.deepEqual(repairContrast(repaired).notes, []);
});

test("the button keeps a shadcn style's radius and still gains marketing sizes", () => {
  const maia = `const buttonVariants = cva("rounded-4xl border border-transparent bg-clip-padding", { variants: { size: {\n        "icon-lg": "size-10",\n      } } })`;
  const patched = patchButtonComponent(maia, { keepRadius: true })!;
  assert.match(patched, /rounded-4xl/);
  assert.match(patched, /xl: "h-11/);
  assert.equal(patchButtonComponent(patched, { keepRadius: true }), null);
  assert.equal(patchButtonComponent(maia), null);
});

test("the cn re-export written by shadcn apply still learns the design-system text sizes", () => {
  const patched = patchUtilsFile('export { cn } from "cn"\n');
  assert.ok(patched?.includes("extendTailwindMerge"));
  assert.ok(patched?.includes('"display"'));
});

test("a neutral theme or chart color must match the base color, as shadcn init requires", () => {
  const theme = { ...randomShadcnTheme(() => 0), baseColor: "mist", theme: "mauve", chartColor: "taupe" } as const;
  const { theme: fixed, notes } = compatibleShadcnTheme(theme);
  assert.equal(fixed.theme, "mist");
  assert.equal(fixed.chartColor, "mist");
  assert.equal(notes.length, 2);
  assert.deepEqual(compatibleShadcnTheme({ ...theme, theme: "blue", chartColor: "mist" }).notes, []);
  for (let index = 0; index < 400; index += 1) {
    const drawn = randomShadcnTheme();
    assert.deepEqual(compatibleShadcnTheme(drawn).notes, [], JSON.stringify(drawn));
  }
});
