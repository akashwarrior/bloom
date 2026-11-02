import { z } from "zod";

import { contrastRatio, isLightColor, parseColor, toHex, type Rgb } from "./color.ts";

/**
 * The art direction written by the design director for one request. Nothing
 * here is a preset or a template: every value is authored per project, then
 * checked mechanically (contrast, font availability) before it is applied.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color such as #1A2B3C.");

const prose = (min: number, max: number) => z.string().trim().min(min).max(max);

const paletteColorSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Use a short kebab-case name.").min(2).max(24)
    .describe("What this color is called in this design."),
  value: hex,
  on: hex.describe("The text color that sits on this color wherever it is used as a surface."),
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
  mode: z.enum(["light", "dark"]).describe("Whether the canvas is light or dark."),
  canvas: hex.describe("The page background."),
  ink: hex.describe("Default text on the canvas."),
  palette: z.array(paletteColorSchema).min(1).max(10).describe("Every other color the design uses, each named for its job in this design."),
  strategy: prose(60, 900).describe("How color is distributed: what dominates, what is rare, where the strongest color is allowed, and what never gets color."),
});

const shapeSchema = z.strictObject({
  radiusPx: z.number().min(0).max(40).optional().describe("Corner radius in px of a standard control and card. Omit when corners are square or differ by surface."),
  controlHeightPx: z.number().int().min(28).max(72).optional().describe("Height in px of a standard button, field and select. Omit for 40."),
  treatment: prose(40, 700).describe("Edges, borders, dividers, depth and surface texture: how regions are separated and what, if anything, is elevated."),
});

const referenceSchema = z.strictObject({
  frame: z.number().int().positive().describe("Number of a composition reference shown in the conversation, in the order it was shown."),
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
  imagery: prose(40, 900).describe("Art direction for images and illustration: medium, subject, framing, light, color relationship to the palette, and how images are cropped and placed. Name each image the first screen needs and how large it appears. Say so plainly when the design should carry itself with type or product UI instead of images."),
  motion: prose(30, 500).describe("What moves, when, and why; or why nothing should."),
  voice: prose(30, 400).describe("How the copy sounds: register, sentence length, what it never says."),
  avoid: z.array(prose(8, 200)).min(2).max(6).describe("The shortcuts most tempting for this particular brief that would make it look like every other result. Written for this project."),
  references: z.array(referenceSchema).max(3).default([]).describe("Up to three composition references from the conversation worth keeping for the builder, each with the principle to borrow. Empty when none were shown."),
});

export type DesignDirectionInput = z.infer<typeof designDirectionSchema>;

/** The direction as stored in `.bloom/design.json`; `explored` is working material and is not kept. */
export const storedDirectionSchema = designDirectionSchema.omit({ explored: true });

export type DesignDirection = z.infer<typeof storedDirectionSchema>;

/** The direction as it is kept: the director's working alternatives are dropped. */
export function storedDirection(input: DesignDirectionInput): DesignDirection {
  const kept: Partial<DesignDirectionInput> = { ...input };
  delete kept.explored;
  return storedDirectionSchema.parse(kept);
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

/** WCAG AA for running text. A floor for legibility, not a taste rule. */
const MIN_TEXT_CONTRAST = 4.5;

const rgb = (value: string): Rgb => parseColor(value)!;

function ratio(text: string, surface: string) {
  return Math.round(contrastRatio(rgb(text), rgb(surface)) * 100) / 100;
}

/** Legibility and naming problems in a direction's colors. Empty when the palette is usable. */
export function colorProblems(color: DesignDirectionInput["color"]) {
  const problems: string[] = [];
  const canvasIsLight = isLightColor(rgb(color.canvas));
  if (canvasIsLight !== (color.mode === "light")) {
    problems.push(`color.mode is "${color.mode}" but canvas ${color.canvas} is ${canvasIsLight ? "light" : "dark"}. Make them agree.`);
  }
  const base = ratio(color.ink, color.canvas);
  if (base < MIN_TEXT_CONTRAST) {
    problems.push(`ink ${color.ink} on canvas ${color.canvas} has contrast ${base}:1; text needs at least ${MIN_TEXT_CONTRAST}:1. Adjust the lightness of one of them.`);
  }
  const seen = new Set(["canvas", "ink"]);
  for (const entry of color.palette) {
    if (seen.has(entry.name)) problems.push(`palette name "${entry.name}" is used twice. Give each color a name of its own.`);
    seen.add(entry.name);
    const value = ratio(entry.on, entry.value);
    if (value < MIN_TEXT_CONTRAST) {
      problems.push(`palette "${entry.name}": text ${entry.on} on ${entry.value} has contrast ${value}:1; it needs at least ${MIN_TEXT_CONTRAST}:1.`);
    }
  }
  return problems;
}

const UNSUPPLIED_PROOF = /\b(?:testimonials?|customer (?:reviews?|quotes?|stories|counts?|logos)|star ratings?|\d(?:\.\d)? stars?|five[- ]star|ratings? (?:row|line|chip|badge|proof)|avatars? (?:\+|and|plus|with) (?:ratings?|stars)|trusted by|loved by|as seen in|(?:social|micro)[- ]?proof|proof (?:rows?|bars?|lines?|strips?|bands?|points?)|logo (?:wall|cloud|row|strip|bar)|(?:row|wall|strip|bar) of (?:\w+ )?(?:wordmarks|logos)|press quotes?|(?:learner|user|member|customer) counts?|learner stories)\b/gi;

/**
 * Proof the page would have to invent. The builder may not fabricate ratings,
 * testimonials, customer counts or logos, so a direction that plans for them
 * cannot be built as written. Empty when the user's own request supplies or
 * asks for such material.
 */
export function proofProblems(direction: Pick<DesignDirectionInput, "concept" | "signature" | "composition" | "mobile" | "imagery">, request: string) {
  if (request.match(UNSUPPLIED_PROOF)) return [];
  const found = new Map<string, string>();
  for (const field of ["concept", "signature", "composition", "mobile", "imagery"] as const) {
    for (const match of direction[field].matchAll(UNSUPPLIED_PROOF)) {
      const phrase = match[0].toLowerCase();
      if (!found.has(phrase)) found.set(phrase, field);
    }
  }
  if (found.size === 0) return [];
  const listed = [...found].slice(0, 6).map(([phrase, field]) => `"${phrase}" in ${field}`).join(", ");
  return [`The direction plans for ${listed}. The request supplies no ratings, testimonials, customer counts or logos, and the builder is not allowed to invent them, so this cannot be built. Remove each one and give that space to something the product can show for itself.`];
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

/** Every color the direction names, by name: `canvas`, `ink` and each palette entry. */
export function directionColors(direction: Pick<DesignDirection, "color">) {
  const colors: Record<string, string> = { canvas: upper(direction.color.canvas), ink: upper(direction.color.ink) };
  for (const entry of direction.color.palette) colors[entry.name] = upper(entry.value);
  return colors;
}

const FONT_VARIABLES = { display: "--display-font", body: "--body-font", utility: "--utility-font" } as const;

/** The `@theme inline` lines that turn the loaded fonts into `font-display`, `font-body` and `font-utility`. */
export function fontThemeLines(fonts: ResolvedFonts) {
  return (["display", "body", "utility"] as const).flatMap((role) => {
    const font = fonts[role];
    return font ? [`--font-${role}: var(${FONT_VARIABLES[role]}), ${font.fallback};`] : [];
  });
}

/**
 * How the direction's fonts are loaded with next/font, with weights and subsets already resolved
 * against the catalog. It goes into DESIGN.md as a snippet; the builder puts it in the root layout.
 */
export function fontLoading(fonts: ResolvedFonts) {
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
    `import { ${imports.join(", ")} } from "next/font/google";`,
    "",
    ...declarations,
    "",
    `// On <html>: className={\`${roles.map(({ role }) => `\${${role}.variable}`).join(" ")}\`}`,
  ].join("\n");
}

/** What the image model renders the first screen from: the director's decisions, not the bare request. */
export function studyPrompt(direction: DesignDirection, request: string) {
  const { canvas, ink, palette } = direction.color;
  const { display, body, utility, treatment } = direction.typography;
  const named = palette.map((color) => `${color.name} ${color.value} (${color.use})`).join("; ");
  return [
    "Render the first screen of this interface as it appears in a desktop browser, already in use. The whole canvas is one live viewport at normal reading scale. Exclude the device, OS status bar and browser chrome. Content may continue below the frame.",
    "A design director wrote the art direction below for this request. Render exactly what it describes: its composition, proportions, type and color. Do not fall back on the page a product of this kind usually gets, and add nothing it does not ask for.",
    request.trim() && `User request: ${request.trim()}`,
    `Idea: ${direction.concept}`,
    `Signature: ${direction.signature}`,
    `Composition: ${direction.composition}`,
    `Color: ${direction.color.mode} canvas ${canvas}, text ${ink}; ${named}. ${direction.color.strategy}`,
    `Type: display ${display.family}, body ${body.family}${utility ? `, labels ${utility.family}` : ""}. ${treatment}`,
    `Shape: ${direction.shape.treatment}`,
    `Imagery: ${direction.imagery}`,
    `Copy voice: ${direction.voice}`,
    `Leave out: ${direction.avoid.join("; ")}. Leave out invented endorsements, ratings, awards and customer counts.`,
  ].filter(Boolean).join("\n");
}

/** A few words per earlier project, so the director can steer away from repeating itself. */
export function directionDigest(direction: DesignDirection) {
  const { canvas, ink, palette } = direction.color;
  const fonts = [direction.typography.display.family, direction.typography.body.family, direction.typography.utility?.family].filter(Boolean).join(" / ");
  const first = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit).replace(/\s+\S*$/, "")}…` : text);
  return [
    `concept: ${first(direction.concept, 220)}`,
    `signature: ${first(direction.signature, 160)}`,
    `composition: ${first(direction.composition, 220)}`,
    `type: ${fonts}`,
    `color: ${direction.color.mode}; canvas ${canvas}, text ${ink}, palette ${palette.map((color) => color.value).join(" ")}`,
  ].join("\n  ");
}
