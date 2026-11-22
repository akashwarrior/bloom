import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONTS,
  PRESET_FONT_HEADINGS,
  PRESET_ICON_LIBRARIES,
  PRESET_MENU_ACCENTS,
  PRESET_MENU_COLORS,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
} from "shadcn/preset";

import { designSelectionSchema, presetForComponents } from "../lib/design/design-selection.ts";
import { storedDirection } from "../lib/design/direction.ts";
import { directionInput } from "./fixtures/direction.ts";
import { designNotesSchema, generateDesignDoc } from "../lib/design/design-skill.ts";
import {
  compatibleShadcnTheme,
  type ResolvedPreset,
  type ResolvedShadcnTheme,
  type ShadcnTheme,
} from "../lib/design/shadcn-theme.ts";
import {
  BASE_COLOR_OPTIONS,
  FONT_OPTIONS,
  HEADING_FONT_OPTIONS,
  ICON_OPTIONS,
  MENU_ACCENT_OPTIONS,
  MENU_COLOR_OPTIONS,
  RADIUS_OPTIONS,
  STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
  optionLabel,
  componentMenuText,
} from "../lib/design/theme-options.ts";

test("theme metadata covers every shadcn create option", () => {
  const keys = (value: object) => Object.keys(value).sort();
  assert.deepEqual(keys(STYLE_OPTIONS), [...PRESET_STYLES].sort());
  assert.deepEqual(keys(BASE_COLOR_OPTIONS), [...PRESET_BASE_COLORS].sort());
  assert.deepEqual(keys(THEME_COLOR_OPTIONS), [...PRESET_THEMES].sort());
  assert.deepEqual(keys(FONT_OPTIONS), [...PRESET_FONTS].sort());
  assert.deepEqual(keys(HEADING_FONT_OPTIONS), [...PRESET_FONT_HEADINGS].sort());
  assert.deepEqual(keys(ICON_OPTIONS), [...PRESET_ICON_LIBRARIES].sort());
  assert.deepEqual(keys(MENU_ACCENT_OPTIONS), [...PRESET_MENU_ACCENTS].sort());
  assert.deepEqual(keys(MENU_COLOR_OPTIONS), [...PRESET_MENU_COLORS].sort());
  assert.deepEqual(keys(RADIUS_OPTIONS), [...PRESET_RADII].sort());
  assert.equal(PRESET_CHART_COLORS.length, PRESET_THEMES.length);
  assert.equal(optionLabel(FONT_OPTIONS, "instrument-serif"), "Instrument Serif");
  assert.equal(optionLabel(FONT_OPTIONS, "instrument-sans"), "Instrument Sans");

  const menu = componentMenuText();
  for (const value of PRESET_STYLES) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(STYLE_OPTIONS[value].description));
    assert.equal("pickWhen" in STYLE_OPTIONS[value], false);
    assert.equal("avoidWhen" in STYLE_OPTIONS[value], false);
  }
  for (const value of PRESET_ICON_LIBRARIES) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(ICON_OPTIONS[value].note));
  }
  for (const value of PRESET_RADII) assert.match(menu, new RegExp(`\\\`${value}\\\``));
  for (const value of PRESET_MENU_ACCENTS) assert.ok(menu.includes(MENU_ACCENT_OPTIONS[value].note));
  for (const value of PRESET_MENU_COLORS) assert.ok(menu.includes(MENU_COLOR_OPTIONS[value].note));
  // The director chooses colors and fonts freely, so the menu must not offer a closed list of them.
  assert.doesNotMatch(menu, /### (?:Theme|Base color|Body font|Heading font)/);
});

test("Rhea with a large radius is normalized before shadcn sees it", () => {
  const theme: ShadcnTheme = {
    style: "rhea",
    baseColor: "stone",
    theme: "blue",
    chartColor: "amber",
    font: "inter",
    fontHeading: "inherit",
    iconLibrary: "lucide",
    radius: "large",
    mode: "light",
    menuAccent: "bold",
    menuColor: "inverted-translucent",
  };
  const { theme: fixed, notes } = compatibleShadcnTheme(theme);
  assert.equal(fixed.radius, "medium");
  assert.match(notes[0] ?? "", /Rhea does not support the large radius/);
});

const themeInput: ShadcnTheme = {
  style: "sera",
  baseColor: "stone",
  theme: "stone",
  chartColor: "amber",
  font: "inter",
  fontHeading: "instrument-serif",
  iconLibrary: "hugeicons",
  radius: "medium",
  mode: "light",
  menuAccent: "bold",
  menuColor: "default",
};

const resolved: ResolvedShadcnTheme = {
  code: "b0",
  vars: {
    background: "#FAFAF9",
    foreground: "#1C1917",
    primary: "#1C1917",
    "primary-foreground": "#FAFAF9",
    muted: "#F5F5F4",
    "muted-foreground": "#57534E",
    border: "#E7E5E4",
    ring: "#A8A29E",
    accent: "#1C1917",
    "accent-foreground": "#FAFAF9",
  },
  darkVars: {
    background: "#1C1917",
    foreground: "#FAFAF9",
    primary: "#E7E5E4",
    "primary-foreground": "#1C1917",
    muted: "#292524",
    "muted-foreground": "#A8A29E",
    border: "rgb(255 255 255 / 10%)",
    ring: "#78716C",
    accent: "#E7E5E4",
    "accent-foreground": "#1C1917",
  },
  radiusPx: 10,
  chart: ["#FDE68A", "#F59E0B", "#E17100", "#BB4D00", "#973C00"],
  iconPackage: "@hugeicons/react + @hugeicons/core-free-icons",
};

const theme: ResolvedPreset = { input: themeInput, resolved };
const direction = storedDirection(directionInput);

test("the design selection is a written direction plus a component base", () => {
  const components = { style: "sera", iconLibrary: "hugeicons", radius: "medium", menuAccent: "bold", menuColor: "default" } as const;
  const parsed = designSelectionSchema.parse({ direction: directionInput, components });
  assert.equal(parsed.direction.concept, directionInput.concept);
  assert.deepEqual(parsed.components, components);
  // A closed preset of colors and fonts is no longer the director's output.
  assert.throws(() => designSelectionSchema.parse({ shadcn: themeInput }));
  assert.throws(() => designSelectionSchema.parse({ direction: { ...directionInput, concept: "Nice." }, components }));
  assert.throws(() => designSelectionSchema.parse({ direction: { ...directionInput, explored: [] }, components }));

  const preset = presetForComponents(components, "dark");
  assert.equal(preset.style, "sera");
  assert.equal(preset.mode, "dark");
  assert.deepEqual(compatibleShadcnTheme(preset).notes, []);
});

test("DESIGN.md carries the written direction and the tokens it resolved to", () => {
  const notes = designNotesSchema.parse({
    inspiration: [{ number: 1, imageId: "quiet-editorial", assetUrl: "/api/assets/library-frame-1.webp", batch: 1 }],
  });
  const doc = generateDesignDoc(theme, { notes, direction });

  assert.match(doc, /^# Design direction/m);
  for (const heading of ["The idea", "Composition", "Imagery", "Motion", "Voice", "What this design refuses", "Color", "Type", "Shape and surface", "Inspiration", "Components", "Before you call it done"]) {
    assert.match(doc, new RegExp(`^## ${heading}$`, "m"));
  }
  assert.ok(doc.includes(direction.concept));
  assert.ok(doc.includes(direction.signature));
  assert.ok(doc.includes(direction.composition));
  assert.ok(doc.includes(direction.typography.treatment));
  assert.ok(doc.includes(direction.color.strategy));
  for (const item of direction.avoid) assert.ok(doc.includes(`- ${item}`));

  // The direction's values, not the preset's, are what the page uses.
  assert.match(doc, /`bg-background text-foreground` \| #10231C \/ #F2EDE3/);
  assert.match(doc, /`bg-primary text-primary-foreground` \| #E8B04A \/ #10231C/);
  assert.match(doc, /`bg-signal text-signal-foreground`, `text-signal`, `border-signal` \| #FF5A36 \/ #10231C/);
  assert.match(doc, /designed for dark mode/);
  assert.match(doc, /Display: `font-heading` — Fraunces, with italics/);
  assert.match(doc, /Body: `font-sans` — Hanken Grotesk/);
  assert.match(doc, /Utility: `font-mono` — DM Mono, weights 400\/500/);
  assert.match(doc, /Base radius: 2px/);
  assert.match(doc, /Frame 1 \(\/api\/assets\/library-frame-1\.webp\): /);
  assert.match(doc, /Icons: Hugeicons\. Package: `@hugeicons\/react \+ @hugeicons\/core-free-icons`/);
  assert.match(doc, /shape it with `className`/);
  assert.match(doc, /Do not hand-edit this file, `app\/globals\.css`, `app\/layout\.tsx`, `app\/bloom-fonts\.ts`/);
  assert.doesNotMatch(doc, /`className` is for layout and composition only/);
  assert.doesNotMatch(doc, /explored|whyNot/);
});

test("a preset picked in the theme panel replaces the direction's colors and fonts but keeps its prose", () => {
  const doc = generateDesignDoc(theme, { direction: { ...direction, overlay: false } });
  assert.ok(doc.includes(direction.concept));
  assert.match(doc, /`bg-background text-foreground` \| #FAFAF9 \/ #1C1917/);
  assert.match(doc, /changed in the theme panel/);
  assert.doesNotMatch(doc, /bg-signal/);
  assert.doesNotMatch(doc, /Fraunces/);
  assert.match(doc, /Base radius: 10px/);
});

test("DESIGN.md without a direction still documents tokens and component rules", () => {
  const doc = generateDesignDoc(theme);
  assert.match(doc, /^# Design direction/m);
  assert.doesNotMatch(doc, /^## The idea$/m);
  assert.match(doc, /`bg-primary text-primary-foreground` \| #1C1917 \/ #FAFAF9/);
  assert.match(doc, /No library frames were sampled/);
  const inverted = generateDesignDoc({ input: { ...themeInput, menuColor: "inverted" }, resolved });
  assert.match(inverted, /\(inverted dark surface\) \| `bg-accent text-accent-foreground` \| #E7E5E4 \/ #1C1917/);
});
