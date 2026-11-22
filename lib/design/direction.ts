import z from "zod/v4";

import { contrastRatio, isLightColor, parseColor, toHex, type Rgb } from "./color.ts";

/**
 * The art direction written by the design director for one request. Nothing
 * here is a preset or a template: every value is authored per project, then
 * checked mechanically (contrast, font availability) before it is applied.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color such as #1A2B3C.");

const prose = (min: number, max: number) => z.string().trim().min(min).max(max);

export const DIRECTION_SURFACE_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
] as const;

const colorTokensSchema = z.strictObject({
  background: hex.describe("Page canvas."),
  foreground: hex.describe("Default text on the canvas."),
  card: hex.describe("Raised or grouped surface (cards, panels, popovers)."),
  "card-foreground": hex.describe("Text on card."),
  primary: hex.describe("The main action and the strongest emphasis color."),
  "primary-foreground": hex.describe("Text on primary."),
  secondary: hex.describe("Secondary action surface."),
  "secondary-foreground": hex.describe("Text on secondary."),
  muted: hex.describe("Quiet surface for recessed areas."),
  "muted-foreground": hex.describe("Secondary text; must stay readable on background and on muted."),
  accent: hex.describe("Quiet hover and selected surface for menus and ghost controls. This is an interaction state, not the brand accent; put expressive colors in primary or in `extra`."),
  "accent-foreground": hex.describe("Text on accent."),
  border: hex.describe("Hairlines, dividers and input outlines."),
  destructive: hex.optional().describe("Error and destructive actions. Omit to keep the component default."),
  ring: hex.optional().describe("Focus ring. Omit to use primary."),
});

const extraColorSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Use a short kebab-case name.").min(2).max(24)
    .describe("Token name, used as bg-<name>, text-<name>, border-<name>."),
  value: hex,
  on: hex.describe("Text color that sits on this color when it is used as a surface; exposed as text-<name>-foreground."),
  use: prose(8, 200).describe("Where this color appears and how much of the page it may occupy."),
});

const fontSchema = z.strictObject({
  family: z.string().trim().min(2).max(60).describe("Exact Google Fonts family name."),
  weights: z.array(z.number().int().min(100).max(900).multipleOf(100)).max(6).optional()
    .describe("Weights the design uses. Needed for static families; variable families load their full range."),
  italic: z.boolean().optional().describe("Load the italic style when the design uses it."),
  fallback: z.enum(["sans-serif", "serif", "monospace"]).describe("Generic family used while the font loads."),
});

export type DirectionFont = z.infer<typeof fontSchema>;

const typographySchema = z.strictObject({
  display: fontSchema.describe("Headlines and the largest type. Exposed as font-heading."),
  body: fontSchema.describe("Running text and interface text. Exposed as font-sans."),
  utility: fontSchema.optional().describe("Optional third face for labels, data, captions or code. Exposed as font-mono."),
  treatment: prose(80, 1_200).describe("How type carries the hierarchy on this page: the size of the largest and smallest type and the steps between, weights, line-height, letter-spacing, case, measure, and where each face is used. Give real values."),
});

const colorSchema = z.strictObject({
  mode: z.enum(["light", "dark"]).describe("Whether the canvas is light or dark. Components render their matching state."),
  tokens: colorTokensSchema,
  extra: z.array(extraColorSchema).max(6).default([]).describe("Additional named colors the concept needs beyond the semantic roles. Leave empty when the roles are enough."),
  chart: z.array(hex).length(5).optional().describe("Five data-visualization colors, only when the product shows charts."),
  strategy: prose(60, 900).describe("How color is distributed: what dominates, what is rare, where the strongest color is allowed, and what never gets color."),
});

const shapeSchema = z.strictObject({
  radiusPx: z.number().min(0).max(40).optional().describe("Base corner radius in px. Omit to keep the component style's radius."),
  treatment: prose(40, 700).describe("Edges, borders, dividers, depth and surface texture: how regions are separated and what, if anything, is elevated."),
});

const referenceSchema = z.strictObject({
  frame: z.number().int().positive().describe("Number of a sampled frame."),
  borrow: prose(20, 300).describe("The transferable principle taken from it (a proportion, a rhythm, a type relationship), never its content or exact layout."),
});

const exploredSchema = z.strictObject({
  direction: prose(30, 400).describe("A genuinely different direction that was considered for this brief."),
  whyNot: prose(20, 300).describe("Why the chosen direction serves this brief better."),
});

export const designDirectionSchema = z.strictObject({
  explored: z.array(exploredSchema).length(2).describe("Two alternative directions you drafted and set aside. They must differ from the chosen one and from each other in structure, not only in color."),
  concept: prose(80, 900).describe("The idea behind this design: what it wants the audience to feel and understand, and the visual point of view that follows from this specific subject."),
  signature: prose(40, 500).describe("The one thing a visitor would remember and describe to someone else. It must come from the subject."),
  composition: prose(150, 2_000).describe("How the requested page is organized: the grid and its proportions, what the first viewport shows, how density and scale change down the page, how regions differ from one another, and where the signature lives."),
  mobile: prose(40, 600).describe("How the composition reorganizes on a narrow screen, beyond stacking."),
  color: colorSchema,
  typography: typographySchema,
  shape: shapeSchema,
  imagery: prose(40, 900).describe("Art direction for images and illustration: medium, subject, framing, light, color relationship to the palette, and how images are cropped and placed. Say so plainly when the design should carry itself with type or product UI instead of images."),
  motion: prose(30, 500).describe("What moves, when, and why; or why nothing should."),
  voice: prose(30, 400).describe("How the copy sounds: register, sentence length, what it never says."),
  avoid: z.array(prose(8, 200)).min(2).max(6).describe("The shortcuts most tempting for this particular brief that would make it look like every other result. Written for this project."),
  references: z.array(referenceSchema).max(3).default([]).describe("Up to three sampled frames worth showing to the builder, each with the principle to borrow."),
});

export type DesignDirectionInput = z.infer<typeof designDirectionSchema>;

/** The direction as stored in `.bloom/design.json`; `explored` is working material and is not kept. */
export const storedDirectionSchema = designDirectionSchema.omit({ explored: true }).extend({
  /** False once the user picks a preset in the theme panel: the prose stays, the custom tokens and fonts go. */
  overlay: z.boolean().default(true),
});

export type DesignDirection = z.infer<typeof storedDirectionSchema>;

/** The direction as it is kept: the director's working alternatives are dropped and the overlay starts on. */
export function storedDirection(input: DesignDirectionInput): DesignDirection {
  const kept: Partial<DesignDirectionInput> = { ...input };
  delete kept.explored;
  return storedDirectionSchema.parse({ ...kept, overlay: true });
}

export type FontCatalog = Record<string, { weights: string[]; styles: string[]; subsets?: string[] }>;

export type ResolvedFont = {
  family: string;
  /** Identifier exported by next/font/google. */
  importName: string;
  weights: string[] | null;
  styles: string[] | null;
  subsets: string[];
  fallback: DirectionFont["fallback"];
};

const PAIRS: Array<[keyof z.infer<typeof colorTokensSchema>, keyof z.infer<typeof colorTokensSchema>]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
];

const RESERVED_COLOR_NAMES = new Set([
  ...DIRECTION_SURFACE_TOKENS, "popover", "popover-foreground", "destructive", "input", "ring", "sidebar",
  "white", "black", "transparent", "current", "inherit",
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "mauve", "olive", "mist", "taupe",
]);

/** WCAG AA for running text. A floor for legibility, not a taste rule. */
const MIN_TEXT_CONTRAST = 4.5;

const rgb = (value: string): Rgb => parseColor(value)!;

function ratio(text: string, surface: string) {
  return Math.round(contrastRatio(rgb(text), rgb(surface)) * 100) / 100;
}

/** Legibility and naming problems in a direction's colors. Empty when the palette is usable. */
export function colorProblems(color: DesignDirectionInput["color"]) {
  const problems: string[] = [];
  const { tokens } = color;
  const canvasIsLight = isLightColor(rgb(tokens.background));
  if (canvasIsLight !== (color.mode === "light")) {
    problems.push(`color.mode is "${color.mode}" but background ${tokens.background} is ${canvasIsLight ? "light" : "dark"}. Make them agree.`);
  }
  for (const [text, surface] of PAIRS) {
    const value = ratio(tokens[text]!, tokens[surface]!);
    if (value < MIN_TEXT_CONTRAST) {
      problems.push(`${text} ${tokens[text]} on ${surface} ${tokens[surface]} has contrast ${value}:1; text needs at least ${MIN_TEXT_CONTRAST}:1. Adjust the lightness of one of them.`);
    }
  }
  const seen = new Set<string>();
  for (const extra of color.extra) {
    if (
      RESERVED_COLOR_NAMES.has(extra.name) ||
      extra.name.endsWith("-foreground") ||
      /^(?:chart|sidebar)-/.test(extra.name) ||
      // "rose-500" would generate classes identical to Tailwind's palette, which the page lint rejects.
      RESERVED_COLOR_NAMES.has(extra.name.replace(/-(?:50|[1-9]00|950)$/, ""))
    ) {
      problems.push(`extra color name "${extra.name}" collides with an existing token or palette name. Give it a name of its own.`);
    }
    if (seen.has(extra.name)) problems.push(`extra color name "${extra.name}" is used twice.`);
    seen.add(extra.name);
    const value = ratio(extra.on, extra.value);
    if (value < MIN_TEXT_CONTRAST) {
      problems.push(`extra "${extra.name}": text ${extra.on} on ${extra.value} has contrast ${value}:1; it needs at least ${MIN_TEXT_CONTRAST}:1.`);
    }
  }
  return problems;
}

function closestFamilies(family: string, catalog: FontCatalog, limit = 5) {
  const target = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = family.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  return Object.keys(catalog)
    .map((name) => {
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const lower = name.toLowerCase();
      let score = 0;
      if (key.startsWith(target) || target.startsWith(key)) score += 4;
      if (key.includes(target) || target.includes(key)) score += 2;
      score += words.filter((word) => lower.includes(word)).length;
      return { name, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit)
    .map((entry) => entry.name);
}

/** Resolves a requested family against next/font's Google catalog, or explains why it cannot load. */
export function resolveFont(font: DirectionFont, catalog: FontCatalog): { font: ResolvedFont } | { problem: string } {
  const wanted = font.family.trim().toLowerCase();
  const family = Object.keys(catalog).find((name) => name.toLowerCase() === wanted);
  if (!family) {
    const close = closestFamilies(font.family, catalog);
    return {
      problem: `"${font.family}" is not a Google Fonts family available to next/font.${close.length > 0 ? ` Close names: ${close.join(", ")}.` : ""} Use an exact family name.`,
    };
  }
  const entry = catalog[family]!;
  const variable = entry.weights.includes("variable");
  const staticWeights = entry.weights.filter((weight) => weight !== "variable");
  let weights: string[] | null = null;
  if (!variable) {
    const requested = (font.weights ?? []).map(String).filter((weight) => staticWeights.includes(weight));
    if (font.weights && font.weights.length > 0 && requested.length === 0) {
      return { problem: `"${family}" has no weight ${font.weights.join("/")}. Available weights: ${staticWeights.join(", ")}.` };
    }
    weights = requested.length > 0 ? requested : staticWeights.slice(0, 6);
  }
  const italic = Boolean(font.italic) && entry.styles.includes("italic");
  const subsets = entry.subsets?.includes("latin") ? ["latin"] : (entry.subsets ?? []).slice(0, 1);
  return {
    font: {
      family,
      importName: family.replace(/\s+/g, "_"),
      weights,
      styles: italic ? ["normal", "italic"] : null,
      subsets,
      fallback: font.fallback,
    },
  };
}

export type ResolvedFonts = { display: ResolvedFont; body: ResolvedFont; utility: ResolvedFont | null };

export function resolveFonts(typography: DesignDirectionInput["typography"], catalog: FontCatalog): { fonts: ResolvedFonts } | { problems: string[] } {
  const problems: string[] = [];
  const pick = (role: "display" | "body" | "utility") => {
    const spec = typography[role];
    if (!spec) return null;
    const resolved = resolveFont(spec, catalog);
    if ("problem" in resolved) {
      problems.push(`typography.${role}: ${resolved.problem}`);
      return null;
    }
    return resolved.font;
  };
  const display = pick("display");
  const body = pick("body");
  const utility = pick("utility");
  if (problems.length > 0 || !display || !body) return { problems };
  return { fonts: { display, body, utility } };
}

const upper = (value: string) => toHex(rgb(value));

/** Every CSS variable the direction sets, including the ones derived from its semantic roles. */
export function directionCssVars(direction: Pick<DesignDirection, "color" | "shape">) {
  const { tokens, extra, chart } = direction.color;
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (value) vars[key] = upper(value);
  }
  vars.popover = vars.card!;
  vars["popover-foreground"] = vars["card-foreground"]!;
  vars.input = vars.border!;
  vars.ring ??= vars.primary!;
  vars.sidebar = vars.card!;
  vars["sidebar-foreground"] = vars["card-foreground"]!;
  vars["sidebar-primary"] = vars.primary!;
  vars["sidebar-primary-foreground"] = vars["primary-foreground"]!;
  vars["sidebar-accent"] = vars.accent!;
  vars["sidebar-accent-foreground"] = vars["accent-foreground"]!;
  vars["sidebar-border"] = vars.border!;
  vars["sidebar-ring"] = vars.ring!;
  const charts = chart ?? [...new Set([tokens.primary, ...extra.map((color) => color.value), tokens.foreground, tokens["muted-foreground"], tokens.secondary, tokens.border].map(upper))].slice(0, 5);
  charts.forEach((value, index) => {
    vars[`chart-${index + 1}`] = upper(value);
  });
  for (const color of extra) {
    vars[color.name] = upper(color.value);
    vars[`${color.name}-foreground`] = upper(color.on);
  }
  return vars;
}

export const BLOOM_FONTS_PATH = "app/bloom-fonts.ts";
const FONT_VARIABLES = { display: "--bloom-font-display", body: "--bloom-font-body", utility: "--bloom-font-utility" } as const;

/** The Bloom-owned module that loads the direction's fonts through next/font. */
export function fontsModule(fonts: ResolvedFonts) {
  const roles = (["display", "body", "utility"] as const).flatMap((role) => {
    const font = fonts[role];
    return font ? [{ role, font }] : [];
  });
  const imports = [...new Set(roles.map(({ font }) => font.importName))];
  const declarations = roles.map(({ role, font }) => {
    const options = [
      // next/font preloads by subset; a family without one is loaded on demand instead.
      font.subsets.length > 0 ? `subsets: ${JSON.stringify(font.subsets)}` : "preload: false",
      `variable: "${FONT_VARIABLES[role]}"`,
      `display: "swap"`,
      ...(font.weights ? [`weight: ${JSON.stringify(font.weights)}`] : []),
      ...(font.styles ? [`style: ${JSON.stringify(font.styles)}`] : []),
    ];
    return `const ${role} = ${font.importName}({ ${options.join(", ")} });`;
  });
  return [
    "// Generated by Bloom from the design direction. Do not edit; start a redesign to change the fonts.",
    `import { ${imports.join(", ")} } from "next/font/google";`,
    "",
    ...declarations,
    "",
    `export const bloomFontVariables = [${roles.map(({ role }) => `${role}.variable`).join(", ")}].join(" ");`,
    "",
  ].join("\n");
}

const BLOCK_START = "/* bloom:direction:start */";
const BLOCK_END = "/* bloom:direction:end */";
const BLOCK_PATTERN = /\n*\/\* bloom:direction:start \*\/[\s\S]*?\/\* bloom:direction:end \*\/\n?/g;

/**
 * The CSS Bloom appends after shadcn's tokens: the direction's colors, radius,
 * fonts and named colors. A light direction leaves shadcn's `.dark` block alone
 * so inverted menus still have a dark side; a dark direction owns both.
 */
export function directionCss(direction: Pick<DesignDirection, "color" | "shape">, fonts: ResolvedFonts | null) {
  const vars = directionCssVars(direction);
  const extraNames = direction.color.extra.flatMap((color) => [color.name, `${color.name}-foreground`]);
  const radius = direction.shape.radiusPx;
  const stack = (role: keyof typeof FONT_VARIABLES, fallback: string) => `var(${FONT_VARIABLES[role]}), ${fallback}`;
  const fontLines = fonts
    ? [
      `  --font-sans: ${stack("body", fonts.body.fallback)};`,
      `  --font-heading: ${stack("display", fonts.display.fallback)};`,
      ...(fonts.utility ? [`  --font-mono: ${stack("utility", fonts.utility.fallback)};`] : []),
    ]
    : [];
  const themeLines = [...fontLines, ...extraNames.map((name) => `  --color-${name}: var(--${name});`)];
  return [
    BLOCK_START,
    `${direction.color.mode === "dark" ? ":root, .dark" : ":root"} {`,
    ...Object.entries(vars).map(([key, value]) => `  --${key}: ${value};`),
    ...(radius === undefined ? [] : [`  --radius: ${Math.round((radius / 16) * 1000) / 1000}rem;`]),
    "}",
    ...(themeLines.length > 0 ? ["@theme inline {", ...themeLines, "}"] : []),
    BLOCK_END,
  ].join("\n");
}

/** Replaces Bloom's block in globals.css, or removes it when `block` is null. */
export function withDirectionCss(css: string, block: string | null) {
  const stripped = css.replace(BLOCK_PATTERN, "\n").replace(/\s+$/, "");
  return block ? `${stripped}\n\n${block}\n` : `${stripped}\n`;
}

const FONT_IMPORT = 'import { bloomFontVariables } from "./bloom-fonts"';

/**
 * Wires the direction into shadcn's root layout: the font variables on <html>
 * and the color mode the palette was designed for. Passing null restores the
 * layout. Returns null when the layout no longer has the shape shadcn wrote.
 */
export function withDirectionLayout(layout: string, mode: "light" | "dark" | null) {
  let next = layout
    .replace(/^import \{ bloomFontVariables \} from "\.\/bloom-fonts";?\r?\n/m, "")
    .replace(/className=\{cn\(bloomFontVariables,\s*/, "className={cn(")
    .replace(/<ThemeProvider forcedTheme="(?:light|dark)">/, "<ThemeProvider>");
  if (mode === null) return next;
  if (!/import "\.\/globals\.css";?/.test(next) || !/className=\{cn\(/.test(next)) return null;
  next = next
    .replace(/(import "\.\/globals\.css";?)/, `$1\n${FONT_IMPORT}`)
    .replace(/className=\{cn\(/, "className={cn(bloomFontVariables, ")
    .replace(/<ThemeProvider>/, `<ThemeProvider forcedTheme="${mode}">`);
  return next;
}

/** A few words per earlier project, so the director can steer away from repeating itself. */
export function directionDigest(direction: DesignDirection) {
  const { tokens } = direction.color;
  const fonts = [direction.typography.display.family, direction.typography.body.family, direction.typography.utility?.family].filter(Boolean).join(" / ");
  const first = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit).replace(/\s+\S*$/, "")}…` : text);
  return [
    `concept: ${first(direction.concept, 220)}`,
    `signature: ${first(direction.signature, 160)}`,
    `composition: ${first(direction.composition, 220)}`,
    `type: ${fonts}`,
    `color: ${direction.color.mode}; canvas ${tokens.background}, text ${tokens.foreground}, primary ${tokens.primary}${direction.color.extra.length > 0 ? `, extra ${direction.color.extra.map((color) => color.value).join(" ")}` : ""}`,
  ].join("\n  ");
}
