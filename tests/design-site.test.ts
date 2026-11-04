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

import { designSelectionSchema } from "../lib/design/design-selection.ts";
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
  MODE_OPTIONS,
  RADIUS_OPTIONS,
  STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
  optionLabel,
  themeMenuText,
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

  const menu = themeMenuText();
  for (const value of PRESET_STYLES) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(STYLE_OPTIONS[value].description));
    assert.ok(menu.includes(STYLE_OPTIONS[value].geometry));
    assert.equal("official" in STYLE_OPTIONS[value], false);
    assert.equal("pickWhen" in STYLE_OPTIONS[value], false);
    assert.equal("avoidWhen" in STYLE_OPTIONS[value], false);
  }
  for (const value of PRESET_BASE_COLORS) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(BASE_COLOR_OPTIONS[value].note));
  }
  for (const value of PRESET_THEMES) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(THEME_COLOR_OPTIONS[value].note));
  }
  for (const value of PRESET_CHART_COLORS) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(THEME_COLOR_OPTIONS[value].note));
  }
  for (const value of PRESET_FONTS) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(FONT_OPTIONS[value].note));
  }
  for (const value of PRESET_FONT_HEADINGS) {
    if (value === "inherit") assert.match(menu, /`inherit` — same as the body font/);
    else assert.match(menu, new RegExp(`\\\`${value}\\\``));
  }
  for (const value of PRESET_ICON_LIBRARIES) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(ICON_OPTIONS[value].package));
    assert.ok(menu.includes(ICON_OPTIONS[value].import));
    assert.ok(menu.includes(ICON_OPTIONS[value].usage));
  }
  for (const value of PRESET_RADII) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(RADIUS_OPTIONS[value].note));
  }
  for (const option of MODE_OPTIONS) {
    assert.match(menu, new RegExp(`\\\`${option.value}\\\``));
    assert.ok(menu.includes(option.note));
  }
  for (const value of PRESET_MENU_ACCENTS) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(MENU_ACCENT_OPTIONS[value].note));
  }
  for (const value of PRESET_MENU_COLORS) {
    assert.match(menu, new RegExp(`\\\`${value}\\\``));
    assert.ok(menu.includes(MENU_COLOR_OPTIONS[value].note));
  }
  assert.match(menu, /theme\` is the primary color, not the light\/dark mode/);
  assert.match(menu, /Rhea does not support the large radius/);
  assert.match(menu, /Project facts — not preset choices/);
  assert.match(menu, /installs the selected icon package automatically/);
  assert.doesNotMatch(menu, /Pick when|Avoid when|Official pairing|industry|audience|recommended|recommendation|best for|ideal for/i);
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

test("the design selection contains only the shadcn preset", () => {
  assert.deepEqual(designSelectionSchema.parse({ shadcn: themeInput }), { shadcn: themeInput });
  assert.throws(() => designSelectionSchema.parse({ shadcn: themeInput, brand: { name: "Harbor" } }));
});

test("DESIGN.md is a theme-only skill with the preset, role map, inspiration and acceptance rules", () => {
  const notes = designNotesSchema.parse({
    inspiration: [{
      number: 1,
      imageId: "quiet-editorial",
      assetUrl: "/api/assets/library-frame-1.webp",
      batch: 1,
    }],
  });
  const doc = generateDesignDoc(theme, { notes });

  assert.match(doc, /^# Bloom design skill/m);
  assert.match(doc, /## Applied preset/);
  assert.match(doc, /Sera \(sera\)/);
  assert.match(doc, /Stone \/ Stone \/ Amber/);
  assert.match(doc, /Resolved preset code: `b0`/);
  assert.match(doc, /Menus: bold accent; default surface/);
  assert.match(doc, /Icons: Hugeicons\. Package: `@hugeicons\/react \+ @hugeicons\/core-free-icons`/);
  assert.match(doc, /Use only this package; do not add another icon library/);
  assert.match(doc, /Use `components\/ui` components first/);
  assert.match(doc, /sky-600/);
  assert.match(doc, /`className` is for layout and composition only/);
  assert.match(doc, /start a full redesign/);
  assert.match(doc, /Menu hover/);
  assert.match(doc, /Primary action/);

  const inverted = generateDesignDoc({ input: { ...themeInput, menuColor: "inverted" }, resolved });
  assert.match(inverted, /Menu hover \(inverted dark surface\)/);
  assert.match(inverted, /menu hover and selected items \(bold accent on the inverted dark surface\) \| #E7E5E4 \/ #1C1917/);

  assert.match(doc, /## Inspiration/);
  assert.match(doc, /Frame 1: image `quiet-editorial` — \/api\/assets\/library-frame-1\.webp/);
  assert.match(doc, /## Resolved role map/);
  assert.match(doc, /Chart 3 \| `chart-3`/);
  assert.match(doc, /## Acceptance checklist/);
  assert.match(doc, /The page uses `@hugeicons\/react \+ @hugeicons\/core-free-icons`/);
  assert.match(doc, /Do not hand-edit this file, `app\/globals\.css`, `components\/ui` or `\.bloom\/design\.json`/);
  assert.match(doc, /Bloom theme panel/);

  assert.doesNotMatch(doc, /## (?:Page|Composition|Brand|Signature|Imagery|Layout)\b/);
  assert.doesNotMatch(doc, /\bpageKind\b|\brationale\b|\blimitations\b|sectionPadding|contentWidth/i);
  assert.doesNotMatch(doc, /Cream is approximated/);
  assert.doesNotMatch(doc, /Region 2: lagoon/);
  assert.doesNotMatch(doc, /bg-surface-\d/);
  assert.doesNotMatch(doc, /font-display/);
  assert.doesNotMatch(doc, /text-5xl md:text-7xl/);
  assert.doesNotMatch(doc, /max-w-6xl/);
  assert.doesNotMatch(doc, /py-16 md:py-24/);
});

test("DESIGN.md states when no inspiration frames were sampled", () => {
  assert.match(generateDesignDoc(theme), /No design-library frames were sampled/);
});
