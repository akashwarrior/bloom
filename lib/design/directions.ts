import type { DesignBrief, OriginalBrief } from "./brief.ts";
import { chroma, contrastRatio, hslToRgb, parseColor, rgbToHsl, toHex, type Rgb } from "./color.ts";

/** Catalog display serifs that ship a true italic through next/font. */
export const ITALIC_FAMILIES = new Set(["Instrument Serif", "Fraunces", "Newsreader", "Playfair Display", "DM Serif Display", "Bodoni Moda", "Cormorant"]);

export const DIRECTION_IDS = ["kinetic", "editorial", "swiss", "pop", "noir", "organic", "midnight"] as const;
export type DirectionId = (typeof DIRECTION_IDS)[number];

/** How a headline's highlighted phrase is set: accent color, serif italic, or a marker swash. */
export type HighlightStyle = "color" | "italic" | "marker";

type Colors = { background: string; foreground: string };

type DirectionSurface = {
  name: string;
  use: string;
  colors: (accent: string) => Colors;
};

export type Direction = {
  id: DirectionId;
  name: string;
  fits: string;
  look: string;
  theme: DesignBrief["theme"];
  accentGuide: string;
  /** Lighten or darken the accent until it reads as text on the page background; null keeps it as a fill color. */
  accentReadable: "lighten" | "darken" | null;
  vivid: boolean;
  base: { background: string; foreground: string; muted: string; mutedForeground: string; border: string };
  surfaces: DirectionSurface[];
  primary: (accent: string) => Colors;
  display: {
    families: Array<{ family: string; weight: number }>;
    sizePx: number;
    lineHeight: number;
    tracking: number;
    uppercase: boolean;
  };
  headingPx: number;
  body: { families: string[]; sizePx: number };
  mono: string | null;
  shape: DesignBrief["shape"];
  layout: DesignBrief["layout"];
  highlight: HighlightStyle;
  /** Generated renders or photographs carry the page (rather than code-built product screens). */
  imageryLed: boolean;
  devices: string;
  imagery: string;
  blueprint: string;
};

function rgb(hex: string): Rgb {
  return parseColor(hex) ?? { r: 0, g: 0, b: 0 };
}

function mix(color: string, base: string, amount: number) {
  const a = rgb(color);
  const b = rgb(base);
  return toHex({
    r: a.r * amount + b.r * (1 - amount),
    g: a.g * amount + b.g * (1 - amount),
    b: a.b * amount + b.b * (1 - amount),
  });
}

/** Moves a color's lightness until it reaches the contrast target against the background. */
function readable(color: string, background: string, target: number, direction: "lighten" | "darken") {
  const bg = rgb(background);
  const hsl = rgbToHsl(rgb(color));
  let current = rgb(color);
  for (let step = 0; step < 50 && contrastRatio(current, bg) < target; step += 1) {
    hsl.l = Math.min(0.97, Math.max(0.04, hsl.l + (direction === "lighten" ? 0.02 : -0.02)));
    current = hslToRgb(hsl);
  }
  return toHex(current);
}

/** The text color (dark or light) that reads best on a fill. */
function on(fill: string, dark: string, light: string) {
  return contrastRatio(rgb(dark), rgb(fill)) >= contrastRatio(rgb(light), rgb(fill)) ? dark : light;
}

/** A fill and its text color; mid-tone fills that neither text color reads on are deepened until white text does. */
function filled(fill: string, dark: string, light: string): Colors {
  const foreground = on(fill, dark, light);
  if (contrastRatio(rgb(foreground), rgb(fill)) >= 4.5) return { background: fill, foreground };
  return { background: readable(fill, light, 4.5, "darken"), foreground: light };
}

function shiftHue(color: string, degrees: number, saturation: number, lightness: number) {
  const hsl = rgbToHsl(rgb(color));
  return toHex(hslToRgb({ h: (hsl.h + degrees + 360) % 360, s: saturation, l: lightness }));
}

const KINETIC_INK = "#0A0A0B";
const EDITORIAL_PAPER = "#F3EFE6";
const EDITORIAL_INK = "#1A1814";
const SWISS_WHITE = "#F6F6F4";
const SWISS_BLACK = "#0D0D0D";
const POP_CREAM = "#FFF8EF";
const POP_INK = "#1D1631";
const NOIR_BLACK = "#0B0A09";
const NOIR_IVORY = "#EEE8DD";
const ORGANIC_LINEN = "#F3F0E8";
const ORGANIC_INK = "#23271F";
const MIDNIGHT = "#08090C";
const MIDNIGHT_INK = "#ECEEF2";

export const DIRECTIONS: Record<DirectionId, Direction> = {
  kinetic: {
    id: "kinetic",
    name: "Kinetic contrast",
    fits: "crypto and trading, fitness and sport, gaming, energy and drinks, music and events, bold consumer hardware",
    look: "near-black page, one electric accent, giant condensed uppercase headlines, tilted product render, a moving ribbon band",
    theme: "dark",
    accentGuide: "one electric, fully saturated color: acid lime #C8FF00, signal orange #FF5A1F, electric cyan #00E1FF, hot pink #FF2E88, or another neon that suits the brand",
    accentReadable: "lighten",
    vivid: true,
    base: { background: KINETIC_INK, foreground: "#F4F4F0", muted: "#151517", mutedForeground: "#A3A3A8", border: "#2A2A2E" },
    surfaces: [
      { name: "canvas", use: "most sections", colors: () => ({ background: KINETIC_INK, foreground: "#F4F4F0" }) },
      { name: "raised", use: "a quieter band for a feature row or the footer", colors: () => ({ background: "#141416", foreground: "#F4F4F0" }) },
      { name: "accent", use: "the ribbon band and at most one bold panel", colors: (accent) => filled(accent, KINETIC_INK, "#FFFFFF") },
    ],
    primary: (accent) => filled(accent, KINETIC_INK, "#FFFFFF"),
    display: {
      families: [
        { family: "Anton", weight: 400 },
        { family: "Bebas Neue", weight: 400 },
        { family: "Big Shoulders", weight: 800 },
        { family: "League Gothic", weight: 400 },
        { family: "Oswald", weight: 600 },
      ],
      sizePx: 132,
      lineHeight: 0.88,
      tracking: 0,
      uppercase: true,
    },
    headingPx: 84,
    body: { families: ["Instrument Sans", "Hanken Grotesk", "Manrope", "Inter"], sizePx: 17 },
    mono: null,
    shape: { cardRadiusPx: 14, buttonShape: "pill", shadows: "none", borders: true },
    layout: { contentWidthPx: 1240, sectionPaddingPx: 120 },
    highlight: "color",
    imageryLed: true,
    devices: "Hero split with a product render in image frame=\"tilt\" (tilted inside an offset accent frame); a Ribbon (tilted) on the accent surface right after the hero repeating 4-6 short brand phrases; FeatureCards variant numbered (big 01/02/03 in the accent); Cta panel pattern=\"stripes\". The accent colors one key word in the hero and CTA headlines (highlight) and nothing decorative elsewhere.",
    imagery: "dramatic studio product render: matte black or graphite object, rim light and edge glow in the accent color, dark stone or glossy reflective floor, deep shadows, cinematic contrast",
    blueprint: "hero (split, tilt image) -> ribbon (tilted, accent surface) -> feature-cards (numbered) -> feature-split (one row with a render) -> statement -> cta (panel, stripes) -> footer (raised)",
  },
  editorial: {
    id: "editorial",
    name: "Editorial paper",
    fits: "wealth, banking and insurance, legal and advisory, coffee and food brands, fashion, publishing, architecture, travel and hospitality",
    look: "warm paper page, large serif headlines with an italic phrase, full-height photography, hairline rules, calm generous spacing",
    theme: "light",
    accentGuide: "one deep, muted color: oxblood #7A1F2B, forest #1F4D3A, ink blue #1E3A8A, burnt sienna #A4471E, or similar",
    accentReadable: "darken",
    vivid: false,
    base: { background: EDITORIAL_PAPER, foreground: EDITORIAL_INK, muted: "#E9E3D6", mutedForeground: "#5E584D", border: "#D6CDBC" },
    surfaces: [
      { name: "paper", use: "most sections", colors: () => ({ background: EDITORIAL_PAPER, foreground: EDITORIAL_INK }) },
      { name: "stone", use: "one alternating band", colors: () => ({ background: "#E8E1D3", foreground: EDITORIAL_INK }) },
      { name: "ink", use: "one dark statement or the closing call to action", colors: () => ({ background: EDITORIAL_INK, foreground: EDITORIAL_PAPER }) },
      { name: "accent", use: "at most one section", colors: (accent) => filled(accent, EDITORIAL_INK, EDITORIAL_PAPER) },
    ],
    primary: () => ({ background: EDITORIAL_INK, foreground: EDITORIAL_PAPER }),
    display: {
      families: [
        { family: "Instrument Serif", weight: 400 },
        { family: "Fraunces", weight: 400 },
        { family: "Newsreader", weight: 400 },
        { family: "Playfair Display", weight: 400 },
        { family: "DM Serif Display", weight: 400 },
      ],
      sizePx: 116,
      lineHeight: 0.98,
      tracking: -0.025,
      uppercase: false,
    },
    headingPx: 68,
    body: { families: ["Instrument Sans", "Schibsted Grotesk", "Hanken Grotesk", "Inter"], sizePx: 17 },
    mono: null,
    shape: { cardRadiusPx: 4, buttonShape: "pill", shadows: "none", borders: true },
    layout: { contentWidthPx: 1280, sectionPaddingPx: 128 },
    highlight: "italic",
    imageryLed: true,
    devices: "Hero split with a photograph in image frame=\"bleed\" (runs to the page edge); one italic phrase in the hero headline (highlight); Statement size lg; FeatureSplit rows with photographs; Steps; eyebrowStyle label (small caps labels, never pills).",
    imagery: "editorial photography: natural window light, fine film grain, warm neutral tones, real materials and still life, generous negative space",
    blueprint: "hero (split, bleed photo) -> statement (lg) -> feature-split (two rows with photographs) -> steps -> faq (split) -> cta (centered, ink surface) -> footer",
  },
  swiss: {
    id: "swiss",
    name: "Swiss precision",
    fits: "developer tools, B2B SaaS, analytics, infrastructure, security, AI platforms, research",
    look: "off-white page, tight heavy grotesk headlines, visible grid, mono labels, square corners, one signal color, a large product screen",
    theme: "light",
    accentGuide: "one signal color: signal red #E5352B, cobalt #2F4BFF, international orange #FF4F00, emerald #00A35C, or similar",
    accentReadable: "darken",
    vivid: true,
    base: { background: SWISS_WHITE, foreground: SWISS_BLACK, muted: "#EBEBE8", mutedForeground: "#575754", border: "#D4D4D0" },
    surfaces: [
      { name: "white", use: "most sections", colors: () => ({ background: SWISS_WHITE, foreground: SWISS_BLACK }) },
      { name: "gray", use: "one alternating band", colors: () => ({ background: "#EBEBE8", foreground: SWISS_BLACK }) },
      { name: "black", use: "one inverted section or the closing call to action", colors: () => ({ background: SWISS_BLACK, foreground: SWISS_WHITE }) },
      { name: "accent", use: "at most one panel", colors: (accent) => filled(accent, SWISS_BLACK, "#FFFFFF") },
    ],
    primary: (accent) => filled(accent, SWISS_BLACK, "#FFFFFF"),
    display: {
      families: [
        { family: "Inter Tight", weight: 600 },
        { family: "Archivo", weight: 700 },
        { family: "Schibsted Grotesk", weight: 700 },
        { family: "Familjen Grotesk", weight: 600 },
        { family: "Instrument Sans", weight: 600 },
      ],
      sizePx: 112,
      lineHeight: 0.94,
      tracking: -0.05,
      uppercase: false,
    },
    headingPx: 68,
    body: { families: ["Inter", "Instrument Sans", "IBM Plex Sans"], sizePx: 16 },
    mono: "IBM Plex Mono",
    shape: { cardRadiusPx: 0, buttonShape: "square", shadows: "none", borders: true },
    layout: { contentWidthPx: 1320, sectionPaddingPx: 112 },
    highlight: "color",
    imageryLed: false,
    devices: "Hero centered with backdrop=\"grid\" and one large code-built product screen (BrowserFrame or AppShell) below; eyebrowStyle label with numbered labels (\"01 / Platform\"); Bento tiles with real UI fragments; FeatureCards variant numbered; square corners everywhere; the signal color only on actions and one highlighted phrase.",
    imagery: "abstract precision render: machined aluminum, glass and geometric forms on a clean studio background, grid-aligned composition, one signal-color detail",
    blueprint: "hero (centered, grid backdrop, large product screen) -> bento -> feature-cards (numbered) -> feature-split -> cta (panel, black surface) -> footer",
  },
  pop: {
    id: "pop",
    name: "Playful pop",
    fits: "consumer apps, family and kids, food delivery, social, education, pets, money apps for young people",
    look: "cream page with saturated color-blocked panels, chunky rounded headlines, marker-highlighted phrase, soft 3D clay renders, big radii",
    theme: "mixed",
    accentGuide: "one saturated, friendly color: tomato #FF5A36, grape #7B5CFF, sunflower #FFC22E, mint #22C99A, sky #3AA8FF",
    accentReadable: null,
    vivid: true,
    base: { background: POP_CREAM, foreground: POP_INK, muted: "#F6ECDD", mutedForeground: "#5A5170", border: "#EADCC8" },
    surfaces: [
      { name: "cream", use: "the page between panels", colors: () => ({ background: POP_CREAM, foreground: POP_INK }) },
      { name: "accent", use: "the hero panel or one card", colors: (accent) => filled(accent, POP_INK, "#FFFFFF") },
      { name: "tint", use: "cards and soft bands", colors: (accent) => ({ background: mix(accent, "#FFFFFF", 0.22), foreground: POP_INK }) },
      { name: "second", use: "a contrasting card or the CTA panel", colors: (accent) => ({ background: shiftHue(accent, 150, 0.75, 0.82), foreground: POP_INK }) },
      { name: "ink", use: "the footer or one bold band", colors: () => ({ background: POP_INK, foreground: POP_CREAM }) },
    ],
    primary: () => ({ background: POP_INK, foreground: POP_CREAM }),
    display: {
      families: [
        { family: "Bricolage Grotesque", weight: 800 },
        { family: "Gabarito", weight: 800 },
        { family: "Bagel Fat One", weight: 400 },
        { family: "Lilita One", weight: 400 },
        { family: "Unbounded", weight: 700 },
      ],
      sizePx: 108,
      lineHeight: 0.95,
      tracking: -0.035,
      uppercase: false,
    },
    headingPx: 64,
    body: { families: ["Figtree", "DM Sans", "Plus Jakarta Sans", "Outfit"], sizePx: 18 },
    mono: null,
    shape: { cardRadiusPx: 32, buttonShape: "pill", shadows: "soft", borders: false },
    layout: { contentWidthPx: 1240, sectionPaddingPx: 112 },
    highlight: "marker",
    imageryLed: true,
    devices: "Hero panel on the accent surface with a 3D render, or hero split with image frame=\"arch\"; FeatureCards tall with each card on a different surface (accent, tint, second) and a render or code visual; one marker-highlighted phrase in the hero and CTA; Steps; Cta panel on the second surface; footer on the ink surface.",
    imagery: "soft 3D clay render: rounded toy-like objects, matte pastel materials from the palette, soft studio light, solid pastel background, playful composition",
    blueprint: "hero (panel, accent surface, render) -> feature-cards (tall, varied surfaces) -> steps -> feature-split (renders) -> faq (center) -> cta (panel, second surface) -> footer (ink)",
  },
  noir: {
    id: "noir",
    name: "Luxe noir",
    fits: "jewelry and watches, fashion, fragrance and beauty, hotels, wine and spirits, luxury cars, real estate, private banking",
    look: "black page, ivory serif headlines with an italic phrase, full-bleed cinematic photography, hairlines, square corners, wide-tracked labels",
    theme: "dark",
    accentGuide: "one refined metal or jewel tone: champagne #C9A96E, bronze #B08155, pearl #D8D2C4, emerald #2E6B57, or similar",
    accentReadable: "lighten",
    vivid: false,
    base: { background: NOIR_BLACK, foreground: NOIR_IVORY, muted: "#15130F", mutedForeground: "#A29A8C", border: "#2A2621" },
    surfaces: [
      { name: "black", use: "most sections", colors: () => ({ background: NOIR_BLACK, foreground: NOIR_IVORY }) },
      { name: "raised", use: "one alternating band or the footer", colors: () => ({ background: "#14120F", foreground: NOIR_IVORY }) },
      { name: "ivory", use: "one light statement or the closing call to action", colors: () => ({ background: NOIR_IVORY, foreground: NOIR_BLACK }) },
    ],
    primary: () => ({ background: NOIR_IVORY, foreground: NOIR_BLACK }),
    display: {
      families: [
        { family: "Bodoni Moda", weight: 400 },
        { family: "Cormorant", weight: 500 },
        { family: "Playfair Display", weight: 400 },
        { family: "Instrument Serif", weight: 400 },
      ],
      sizePx: 124,
      lineHeight: 0.95,
      tracking: -0.02,
      uppercase: false,
    },
    headingPx: 72,
    body: { families: ["Hanken Grotesk", "Instrument Sans", "Manrope"], sizePx: 16 },
    mono: null,
    shape: { cardRadiusPx: 0, buttonShape: "square", shadows: "none", borders: true },
    layout: { contentWidthPx: 1320, sectionPaddingPx: 140 },
    highlight: "italic",
    imageryLed: true,
    devices: "Hero panel with a full-bleed cinematic photograph (image) behind a centered serif headline; Statement size lg; FeatureSplit rows with photographs; FeatureCards media with photographs; eyebrowStyle label; one italic phrase in the hero and statement.",
    imagery: "cinematic luxury photography: low-key lighting, deep shadows, rich textures (silk, stone, brushed metal, glass), warm highlights, shallow depth of field",
    blueprint: "hero (panel, full-bleed photo) -> statement (lg) -> feature-split (photographs) -> feature-cards (media, photographs) -> cta (centered, ivory surface) -> footer (raised)",
  },
  organic: {
    id: "organic",
    name: "Warm organic",
    fits: "wellness, skincare, food and beverage, sustainability, home and interiors, pets, consumer health",
    look: "linen page, soft serif headlines with an italic phrase, arched photographs, tinted color bands, rounded shapes",
    theme: "light",
    accentGuide: "one earthy color: sage #6F8F6A, clay #B5643C, olive #6B7A3A, ocean #2F6F7E, plum #6E3B5A",
    accentReadable: "darken",
    vivid: false,
    base: { background: ORGANIC_LINEN, foreground: ORGANIC_INK, muted: "#E7E2D5", mutedForeground: "#5B6056", border: "#D5CFBF" },
    surfaces: [
      { name: "linen", use: "most sections", colors: () => ({ background: ORGANIC_LINEN, foreground: ORGANIC_INK }) },
      { name: "tint", use: "soft alternating bands and cards", colors: (accent) => ({ background: mix(accent, ORGANIC_LINEN, 0.16), foreground: ORGANIC_INK }) },
      { name: "deep", use: "one rich band or the closing call to action", colors: (accent) => ({ background: readable(accent, ORGANIC_LINEN, 7.5, "darken"), foreground: ORGANIC_LINEN }) },
      { name: "sand", use: "a warm contrasting band", colors: () => ({ background: "#EADFCB", foreground: ORGANIC_INK }) },
    ],
    primary: (accent) => {
      const deep = readable(accent, ORGANIC_LINEN, 7.5, "darken");
      return { background: deep, foreground: ORGANIC_LINEN };
    },
    display: {
      families: [
        { family: "Fraunces", weight: 400 },
        { family: "Newsreader", weight: 400 },
        { family: "DM Serif Display", weight: 400 },
        { family: "Instrument Serif", weight: 400 },
      ],
      sizePx: 104,
      lineHeight: 1,
      tracking: -0.02,
      uppercase: false,
    },
    headingPx: 62,
    body: { families: ["Figtree", "DM Sans", "Host Grotesk", "Hanken Grotesk"], sizePx: 17 },
    mono: null,
    shape: { cardRadiusPx: 28, buttonShape: "pill", shadows: "subtle", borders: false },
    layout: { contentWidthPx: 1240, sectionPaddingPx: 120 },
    highlight: "italic",
    imageryLed: true,
    devices: "Hero split with a photograph in image frame=\"arch\"; Statement; FeatureCards media with photographs; FeatureSplit; sections alternating linen, tint, and sand; one italic phrase in the hero and CTA; Cta panel on the deep surface.",
    imagery: "natural photography: soft daylight, organic textures (linen, ceramic, wood, leaves, stone), muted earthy palette, calm composition with negative space",
    blueprint: "hero (split, arch photo) -> statement -> feature-cards (media, photographs, tint surface) -> feature-split -> faq (split) -> cta (panel, deep surface) -> footer",
  },
  midnight: {
    id: "midnight",
    name: "Midnight product",
    fits: "AI products, developer platforms, productivity and collaboration SaaS, fintech infrastructure",
    look: "blue-black page, crisp medium-weight grotesk headlines, a soft light glow at the top, one large product screen, hairline-bordered bento tiles",
    theme: "dark",
    accentGuide: "one luminous color: electric violet #7C5CFF, azure #3B82F6, mint #34D399, amber #F5A524",
    accentReadable: "lighten",
    vivid: true,
    base: { background: MIDNIGHT, foreground: MIDNIGHT_INK, muted: "#11131A", mutedForeground: "#9499A6", border: "#222530" },
    surfaces: [
      { name: "night", use: "most sections", colors: () => ({ background: MIDNIGHT, foreground: MIDNIGHT_INK }) },
      { name: "raised", use: "one alternating band or the footer", colors: () => ({ background: "#0E1015", foreground: MIDNIGHT_INK }) },
      { name: "paper", use: "optional single light section for contrast", colors: () => ({ background: "#F3F4F6", foreground: "#0B0C10" }) },
    ],
    primary: () => ({ background: MIDNIGHT_INK, foreground: MIDNIGHT }),
    display: {
      families: [
        { family: "Inter Tight", weight: 600 },
        { family: "Instrument Sans", weight: 600 },
        { family: "Mona Sans", weight: 600 },
        { family: "Funnel Display", weight: 600 },
      ],
      sizePx: 96,
      lineHeight: 1,
      tracking: -0.045,
      uppercase: false,
    },
    headingPx: 60,
    body: { families: ["Inter", "Instrument Sans", "Hanken Grotesk"], sizePx: 16 },
    mono: "Geist Mono",
    shape: { cardRadiusPx: 16, buttonShape: "rounded", shadows: "soft", borders: true },
    layout: { contentWidthPx: 1200, sectionPaddingPx: 120 },
    highlight: "color",
    imageryLed: false,
    devices: "Hero centered with backdrop=\"glow\" and one large code-built product screen (AppShell or BrowserFrame, nearly full page width) bleeding off the bottom; LogoStrip marquee of platforms it factually supports; Bento tiles with real UI fragments; FeatureSplit; Cta centered.",
    imagery: "abstract light render: soft volumetric light, glass prisms and gradients in the accent hue on deep blue-black",
    blueprint: "hero (centered, glow, large product screen) -> logo-strip (marquee) -> bento -> feature-split -> faq (center) -> cta (centered) -> footer (raised)",
  },
};

/** The direction menu for the brief step. */
export function directionsForPrompt() {
  return DIRECTION_IDS.map((id) => {
    const direction = DIRECTIONS[id];
    const surfaces = direction.surfaces.map((surface, index) => `${index + 1} ${surface.name} (${surface.use})`).join("; ");
    return [
      `#### ${id}: ${direction.name}`,
      `Fits: ${direction.fits}.`,
      `Look: ${direction.look}.`,
      `Accent: ${direction.accentGuide}.`,
      `Display fonts: ${direction.display.families.map((entry) => entry.family).join(", ")}${direction.display.uppercase ? " (set uppercase)" : ""}. Body fonts: ${direction.body.families.join(", ")}.`,
      `Surfaces: ${surfaces}.`,
      `Devices: ${direction.devices}`,
      `Typical plan: ${direction.blueprint}.`,
    ].join("\n");
  }).join("\n\n");
}

/**
 * Expands the art-direction brief into the full design brief: palette,
 * surfaces, type scale, and shape all come from the curated direction, so
 * the model only decides what is specific to the brand.
 */
export function expandOriginalBrief(input: OriginalBrief): { brief: DesignBrief; problems: string[]; notes: string[] } {
  const direction = DIRECTIONS[input.direction];
  const problems: string[] = [];
  const notes: string[] = [];

  let accent = input.accent.toUpperCase();
  if (direction.vivid && chroma(rgb(accent)) < 45) {
    const hsl = rgbToHsl(rgb(accent));
    accent = toHex(hslToRgb({ h: hsl.h, s: Math.max(hsl.s, 0.9), l: Math.min(Math.max(hsl.l, 0.45), 0.6) }));
    notes.push(`The accent was saturated to ${accent} because ${direction.name} needs a vivid accent.`);
  }
  if (direction.accentReadable) {
    const adjusted = readable(accent, direction.base.background, 4.5, direction.accentReadable).toUpperCase();
    if (adjusted !== accent) notes.push(`The accent was adjusted to ${adjusted} so it reads on the page background.`);
    accent = adjusted;
  }

  const display = direction.display.families.find(
    (entry) => entry.family.toLowerCase() === input.displayFont.trim().toLowerCase(),
  );
  if (!display) {
    problems.push(`displayFont "${input.displayFont}" is not one of the ${direction.name} display fonts: ${direction.display.families.map((entry) => entry.family).join(", ")}.`);
  }
  const body = direction.body.families.find((family) => family.toLowerCase() === input.bodyFont.trim().toLowerCase());
  if (!body) {
    problems.push(`bodyFont "${input.bodyFont}" is not one of the ${direction.name} body fonts: ${direction.body.families.join(", ")}.`);
  }

  const surfaces = direction.surfaces.map((surface) => ({ name: surface.name, ...surface.colors(accent) }));
  const accentFill = filled(accent, "#0B0B0B", "#FFFFFF");
  const primary = direction.primary(accent);
  const chosenDisplay = display ?? direction.display.families[0]!;
  const brief: DesignBrief = {
    anchor: { url: null, keep: `Original art direction "${direction.name}": ${direction.look}. ${input.rationale}` },
    traits: [],
    brand: input.brand,
    theme: direction.theme,
    colors: {
      background: direction.base.background,
      foreground: direction.base.foreground,
      primary: primary.background,
      primaryForeground: primary.foreground,
      accent: accentFill.background,
      accentForeground: accentFill.foreground,
      muted: direction.base.muted,
      mutedForeground: direction.base.mutedForeground,
      border: direction.base.border,
      surfaces,
    },
    typography: {
      display: {
        family: chosenDisplay.family,
        weight: chosenDisplay.weight,
        sizePx: direction.display.sizePx,
        lineHeight: direction.display.lineHeight,
        tracking: direction.display.tracking,
        uppercase: direction.display.uppercase,
      },
      heading: { sizePx: direction.headingPx, weight: chosenDisplay.weight },
      body: { family: body ?? direction.body.families[0]!, weight: 400, sizePx: direction.body.sizePx },
      mono: direction.mono ? { family: direction.mono } : null,
    },
    shape: direction.shape,
    layout: direction.layout,
    signature: input.signature,
    imagery: input.imagery,
    sections: input.sections.map((section) => ({ ...section, anchorFrame: null })),
  };

  for (const section of input.sections) {
    if (section.surface > surfaces.length) {
      problems.push(`Section "${section.id}" uses surface ${section.surface}; ${direction.name} has ${surfaces.length}: ${surfaces.map((surface, index) => `${index + 1} ${surface.name}`).join(", ")}.`);
    }
  }
  return { brief, problems, notes };
}
