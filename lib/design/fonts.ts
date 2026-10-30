export type FontCategory = "sans" | "serif" | "display" | "mono";
export type FontWidth = "condensed" | "normal" | "wide";
export type FontRole = "display" | "body" | "mono";

export type CatalogFont = {
  family: string;
  category: FontCategory;
  width: FontWidth;
  roles: FontRole[];
  character: string;
  /** Static weights available from next/font/google; empty for variable fonts. */
  weights: string[];
  variable: boolean;
};

const font = (
  family: string,
  category: FontCategory,
  width: FontWidth,
  roles: FontRole[],
  character: string,
  weights: string[] | "variable",
): CatalogFont => ({
  family,
  category,
  width,
  roles,
  character,
  weights: weights === "variable" ? [] : weights,
  variable: weights === "variable",
});

/**
 * Curated Google fonts verified against the runtime's next/font catalog.
 * Every entry renders through next/font/google without extra configuration.
 */
export const FONT_CATALOG: CatalogFont[] = [
  font("Bricolage Grotesque", "sans", "normal", ["display", "body"], "quirky contemporary grotesk with optical sizes, characterful at large sizes", "variable"),
  font("Space Grotesk", "sans", "normal", ["display", "body"], "technical geometric grotesk with idiosyncratic details", "variable"),
  font("Syne", "display", "wide", ["display"], "expressive art-school sans that widens dramatically at heavy weights", "variable"),
  font("Unbounded", "display", "wide", ["display"], "wide rounded geometric, futuristic and bold", "variable"),
  font("Familjen Grotesk", "sans", "normal", ["display", "body"], "sharp editorial grotesk with tight curves", "variable"),
  font("Schibsted Grotesk", "sans", "normal", ["display", "body"], "confident news grotesk, sturdy heavy weights", "variable"),
  font("Instrument Sans", "sans", "normal", ["display", "body"], "precise neo-grotesk, crisp product feel", "variable"),
  font("Hanken Grotesk", "sans", "normal", ["display", "body"], "clean neutral grotesk with soft geometry", "variable"),
  font("Host Grotesk", "sans", "normal", ["display", "body"], "friendly modern grotesk with open apertures", "variable"),
  font("Funnel Display", "display", "normal", ["display"], "modern display grotesk with ink traps, sculpted at large sizes", "variable"),
  font("Funnel Sans", "sans", "normal", ["body"], "text companion to Funnel Display", "variable"),
  font("Gabarito", "sans", "normal", ["display", "body"], "rounded geometric, friendly and bold", "variable"),
  font("Mona Sans", "sans", "normal", ["display", "body"], "strong variable grotesk, confident product marketing voice", "variable"),
  font("Hubot Sans", "sans", "normal", ["display"], "technical, slightly squared companion to Mona Sans", "variable"),
  font("Archivo", "sans", "normal", ["display", "body"], "versatile grotesk, punchy at black weights", "variable"),
  font("Red Hat Display", "sans", "normal", ["display"], "geometric-humanist display with warm curves", "variable"),
  font("Sora", "sans", "normal", ["display", "body"], "geometric with a technical, fintech/crypto tone", "variable"),
  font("Outfit", "sans", "normal", ["display", "body"], "clean geometric, round and modern", "variable"),
  font("Urbanist", "sans", "normal", ["display", "body"], "minimal geometric with low contrast", "variable"),
  font("Plus Jakarta Sans", "sans", "normal", ["display", "body"], "modern geometric with personality, startup tone", "variable"),
  font("Manrope", "sans", "normal", ["display", "body"], "semi-condensed modern grotesk, compact and precise", "variable"),
  font("DM Sans", "sans", "normal", ["body", "display"], "low-contrast geometric, very legible", "variable"),
  font("Figtree", "sans", "normal", ["body"], "friendly geometric text face", "variable"),
  font("Onest", "sans", "normal", ["body"], "neutral modern text face", "variable"),
  font("Geist", "sans", "normal", ["body"], "neutral Swiss-style UI face", "variable"),
  font("Rethink Sans", "sans", "normal", ["body", "display"], "modern grotesk with subtle quirks", "variable"),
  font("Albert Sans", "sans", "normal", ["body", "display"], "Scandinavian geometric sans", "variable"),
  font("Epilogue", "sans", "normal", ["display", "body"], "editorial grotesk with sharp, dense heavy weights", "variable"),
  font("Inter Tight", "sans", "normal", ["display"], "tightly spaced neo-grotesk for big headlines", "variable"),
  font("Wix Madefor Display", "sans", "normal", ["display"], "friendly rounded-geometric product display face", "variable"),
  font("Wix Madefor Text", "sans", "normal", ["body"], "text companion to Wix Madefor Display", "variable"),
  font("Inter", "sans", "normal", ["body"], "neutral UI text face", "variable"),
  font("IBM Plex Sans", "sans", "normal", ["body", "display"], "engineered corporate grotesk", "variable"),
  font("Public Sans", "sans", "normal", ["body"], "neutral, sturdy text face", "variable"),
  font("Noto Sans", "sans", "normal", ["body"], "neutral humanist text face with wide language coverage", "variable"),
  font("Nunito Sans", "sans", "normal", ["display", "body"], "soft, slightly rounded humanist sans", "variable"),
  font("Roboto", "sans", "normal", ["body"], "familiar neo-grotesk system text face", "variable"),
  font("Raleway", "sans", "normal", ["display", "body"], "elegant thin-to-black geometric sans", "variable"),
  font("Montserrat", "sans", "normal", ["display", "body"], "wide urban geometric sans", "variable"),
  font("Source Sans 3", "sans", "normal", ["body"], "clear humanist text face", "variable"),
  font("Oxanium", "display", "normal", ["display"], "squared techno display face", "variable"),
  font("Work Sans", "sans", "normal", ["body", "display"], "grotesk with early-Swiss character", "variable"),
  font("Rubik", "sans", "normal", ["display", "body"], "slightly rounded corners, playful but sturdy", "variable"),
  font("Geologica", "sans", "normal", ["display", "body"], "geometric with optional sharpness, contemporary", "variable"),
  font("Chivo", "sans", "normal", ["display", "body"], "grotesk with strong heavy weights", "variable"),
  font("Darker Grotesque", "display", "condensed", ["display"], "tall, tight grotesk for stacked headlines", "variable"),
  font("Anton", "display", "condensed", ["display"], "heavy condensed poster gothic", ["400"]),
  font("Bebas Neue", "display", "condensed", ["display"], "all-caps condensed poster face", ["400"]),
  font("Oswald", "display", "condensed", ["display"], "condensed gothic, editorial headlines", "variable"),
  font("Big Shoulders", "display", "condensed", ["display"], "condensed industrial Chicago-style gothic", "variable"),
  font("League Gothic", "display", "condensed", ["display"], "classic tall condensed gothic", "variable"),
  font("Antonio", "display", "condensed", ["display"], "refined condensed sans", "variable"),
  font("Sofia Sans Condensed", "display", "condensed", ["display", "body"], "condensed grotesk with a broad weight range", "variable"),
  font("Archivo Black", "display", "normal", ["display"], "heavy grotesk, blunt and loud", ["400"]),
  font("Dela Gothic One", "display", "wide", ["display"], "ultra-heavy chunky gothic, blocky poster voice", ["400"]),
  font("Rubik Mono One", "display", "wide", ["display"], "chunky monospaced capitals, bold and graphic", ["400"]),
  font("Bowlby One", "display", "normal", ["display"], "fat poster sans", ["400"]),
  font("Titan One", "display", "normal", ["display"], "rounded heavy, toy-like", ["400"]),
  font("Lilita One", "display", "normal", ["display"], "rounded heavy, playful", ["400"]),
  font("Bagel Fat One", "display", "wide", ["display"], "super-round fat display", ["400"]),
  font("Climate Crisis", "display", "wide", ["display"], "ultra-heavy compressed-to-wide variable display", "variable"),
  font("Krona One", "display", "wide", ["display"], "wide extended grotesk", ["400"]),
  font("Michroma", "display", "wide", ["display"], "wide squared technical face", ["400"]),
  font("Syncopate", "display", "wide", ["display"], "wide all-caps geometric", ["400", "700"]),
  font("Unna", "serif", "normal", ["display"], "elegant transitional serif", ["400", "700"]),
  font("Alfa Slab One", "display", "normal", ["display"], "heavy slab serif", ["400"]),
  font("Righteous", "display", "normal", ["display"], "retro rounded geometric", ["400"]),
  font("Shrikhand", "display", "normal", ["display"], "retro heavy italic", ["400"]),
  font("Instrument Serif", "serif", "condensed", ["display"], "elegant condensed display serif, editorial luxury", ["400"]),
  font("Fraunces", "serif", "normal", ["display", "body"], "soft, wonky old-style serif with optical sizes", "variable"),
  font("Playfair Display", "serif", "normal", ["display"], "high-contrast didone for headlines", "variable"),
  font("DM Serif Display", "serif", "normal", ["display"], "high-contrast display serif", ["400"]),
  font("Young Serif", "serif", "normal", ["display"], "warm, heavy old-style serif", ["400"]),
  font("Gloock", "serif", "normal", ["display"], "sharp high-contrast serif", ["400"]),
  font("Libre Caslon Display", "serif", "normal", ["display"], "classic Caslon display", ["400"]),
  font("Bodoni Moda", "serif", "normal", ["display"], "fashion didone with optical sizes", "variable"),
  font("Cormorant", "serif", "normal", ["display"], "delicate Garamond-style display", "variable"),
  font("EB Garamond", "serif", "normal", ["body", "display"], "classic book Garamond", "variable"),
  font("Newsreader", "serif", "normal", ["body", "display"], "editorial text serif with optical sizes", "variable"),
  font("Literata", "serif", "normal", ["body"], "contemporary book serif", "variable"),
  font("Source Serif 4", "serif", "normal", ["body", "display"], "versatile text serif", "variable"),
  font("Crimson Pro", "serif", "normal", ["body"], "literary text serif", "variable"),
  font("Lora", "serif", "normal", ["body"], "calligraphic text serif", "variable"),
  font("Noto Serif", "serif", "normal", ["display", "body"], "neutral book serif", "variable"),
  font("Merriweather", "serif", "normal", ["display", "body"], "sturdy screen serif with large x-height", "variable"),
  font("Roboto Slab", "serif", "normal", ["display", "body"], "mechanical slab serif", "variable"),
  font("JetBrains Mono", "mono", "normal", ["mono"], "developer monospace", "variable"),
  font("IBM Plex Mono", "mono", "normal", ["mono"], "engineered monospace", ["300", "400", "500", "600", "700"]),
  font("Space Mono", "mono", "normal", ["mono", "display"], "retro-technical monospace", ["400", "700"]),
  font("Geist Mono", "mono", "normal", ["mono"], "neutral UI monospace", "variable"),
  font("DM Mono", "mono", "normal", ["mono"], "soft geometric monospace", ["300", "400", "500"]),
  font("Fragment Mono", "mono", "normal", ["mono"], "Helvetica-like monospace", ["400"]),
  font("Martian Mono", "mono", "wide", ["mono", "display"], "wide technical monospace", "variable"),
];

const BY_FAMILY = new Map(
  FONT_CATALOG.map((entry) => [entry.family.toLowerCase(), entry]),
);

export function findCatalogFont(family: string) {
  return BY_FAMILY.get(family.trim().toLowerCase()) ?? null;
}

/** next/font/google export identifier, e.g. "Source Serif 4" -> "Source_Serif_4". */
export function nextFontExportName(family: string) {
  return family.trim().replace(/\s+/g, "_");
}

/** Weights to request for a static font; variable fonts need none. */
export function weightsFor(entry: CatalogFont, wanted: number[]) {
  if (entry.variable) return null;
  const available = entry.weights.map(Number);
  const chosen = new Set<number>();
  for (const weight of wanted) {
    const nearest = available.reduce((best, candidate) =>
      Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best,
    available[0]!);
    chosen.add(nearest);
  }
  return [...chosen].sort((a, b) => a - b).map(String);
}

export function catalogForPrompt() {
  const group = (predicate: (entry: CatalogFont) => boolean) =>
    FONT_CATALOG.filter(predicate)
      .map((entry) => `${entry.family} (${entry.width === "normal" ? "" : `${entry.width}, `}${entry.character})`)
      .join("; ");
  return [
    `Display sans: ${group((entry) => entry.roles.includes("display") && entry.category === "sans")}`,
    `Display/poster: ${group((entry) => entry.category === "display")}`,
    `Serif: ${group((entry) => entry.category === "serif")}`,
    `Body text: ${group((entry) => entry.roles.includes("body"))}`,
    `Mono: ${group((entry) => entry.category === "mono")}`,
  ].join("\n");
}

/**
 * Glyph metrics measured in Chromium at 100px: average lowercase advance width
 * (em) at 400 and 700, x-height and cap height (em), and the foot/stem width
 * ratio of a capital I (above ~1.8 indicates serifs or slab terminals).
 */
export type FontMetrics = { w400: number; w700: number; x: number; cap: number; serif: number };

export const FONT_METRICS: Record<string, FontMetrics> = {
  "Bricolage Grotesque": { w400: 0.535, w700: 0.565, x: 0.52, cap: 0.66, serif: 1 },
  "Space Grotesk": { w400: 0.553, w700: 0.555, x: 0.49, cap: 0.7, serif: 1 },
  "Syne": { w400: 0.502, w700: 0.632, x: 0.5, cap: 0.66, serif: 1 },
  "Unbounded": { w400: 0.685, w700: 0.73, x: 0.57, cap: 0.75, serif: 1 },
  "Familjen Grotesk": { w400: 0.479, w700: 0.51, x: 0.5, cap: 0.65, serif: 1 },
  "Schibsted Grotesk": { w400: 0.525, w700: 0.564, x: 0.53, cap: 0.71, serif: 3.24 },
  "Instrument Sans": { w400: 0.523, w700: 0.549, x: 0.51, cap: 0.72, serif: 1 },
  "Hanken Grotesk": { w400: 0.501, w700: 0.51, x: 0.5, cap: 0.7, serif: 1 },
  "Host Grotesk": { w400: 0.517, w700: 0.517, x: 0.5, cap: 0.7, serif: 1 },
  "Funnel Display": { w400: 0.536, w700: 0.558, x: 0.5, cap: 0.68, serif: 1 },
  "Funnel Sans": { w400: 0.503, w700: 0.519, x: 0.5, cap: 0.68, serif: 1 },
  "Gabarito": { w400: 0.487, w700: 0.504, x: 0.49, cap: 0.69, serif: 1 },
  "Mona Sans": { w400: 0.529, w700: 0.565, x: 0.53, cap: 0.73, serif: 1 },
  "Hubot Sans": { w400: 0.528, w700: 0.587, x: 0.54, cap: 0.74, serif: 5.39 },
  "Archivo": { w400: 0.496, w700: 0.54, x: 0.53, cap: 0.69, serif: 1 },
  "Red Hat Display": { w400: 0.495, w700: 0.528, x: 0.51, cap: 0.7, serif: 1 },
  "Sora": { w400: 0.577, w700: 0.598, x: 0.54, cap: 0.73, serif: 1 },
  "Outfit": { w400: 0.497, w700: 0.521, x: 0.48, cap: 0.7, serif: 1 },
  "Urbanist": { w400: 0.5, w700: 0.524, x: 0.51, cap: 0.71, serif: 1 },
  "Plus Jakarta Sans": { w400: 0.539, w700: 0.561, x: 0.54, cap: 0.75, serif: 1 },
  "Manrope": { w400: 0.521, w700: 0.551, x: 0.55, cap: 0.73, serif: 1 },
  "DM Sans": { w400: 0.519, w700: 0.559, x: 0.51, cap: 0.7, serif: 1 },
  "Figtree": { w400: 0.507, w700: 0.528, x: 0.5, cap: 0.7, serif: 1 },
  "Onest": { w400: 0.528, w700: 0.546, x: 0.52, cap: 0.71, serif: 1 },
  "Geist": { w400: 0.515, w700: 0.56, x: 0.53, cap: 0.71, serif: 1 },
  "Rethink Sans": { w400: 0.518, w700: 0.502, x: 0.5, cap: 0.71, serif: 1 },
  "Albert Sans": { w400: 0.514, w700: 0.524, x: 0.5, cap: 0.7, serif: 1 },
  "Epilogue": { w400: 0.549, w700: 0.579, x: 0.54, cap: 0.74, serif: 1 },
  "Inter Tight": { w400: 0.485, w700: 0.529, x: 0.54, cap: 0.73, serif: 1 },
  "Wix Madefor Display": { w400: 0.529, w700: 0.557, x: 0.5, cap: 0.72, serif: 1 },
  "Wix Madefor Text": { w400: 0.526, w700: 0.548, x: 0.5, cap: 0.72, serif: 1 },
  "Inter": { w400: 0.535, w700: 0.562, x: 0.54, cap: 0.73, serif: 1 },
  "IBM Plex Sans": { w400: 0.504, w700: 0.537, x: 0.52, cap: 0.71, serif: 3.5 },
  "Public Sans": { w400: 0.528, w700: 0.545, x: 0.52, cap: 0.73, serif: 1 },
  "Noto Sans": { w400: 0.53, w700: 0.568, x: 0.54, cap: 0.72, serif: 2.89 },
  "Nunito Sans": { w400: 0.506, w700: 0.526, x: 0.5, cap: 0.71, serif: 1 },
  "Roboto": { w400: 0.499, w700: 0.507, x: 0.54, cap: 0.72, serif: 1 },
  "Raleway": { w400: 0.525, w700: 0.548, x: 0.53, cap: 0.71, serif: 1 },
  "Montserrat": { w400: 0.571, w700: 0.601, x: 0.53, cap: 0.7, serif: 1 },
  "Source Sans 3": { w400: 0.472, w700: 0.504, x: 0.49, cap: 0.66, serif: 1 },
  "Oxanium": { w400: 0.521, w700: 0.542, x: 0.52, cap: 0.69, serif: 1 },
  "Work Sans": { w400: 0.546, w700: 0.564, x: 0.5, cap: 0.67, serif: 1 },
  "Rubik": { w400: 0.53, w700: 0.574, x: 0.52, cap: 0.7, serif: 0.9 },
  "Geologica": { w400: 0.544, w700: 0.576, x: 0.5, cap: 0.7, serif: 1 },
  "Chivo": { w400: 0.537, w700: 0.551, x: 0.52, cap: 0.69, serif: 2.41 },
  "Darker Grotesque": { w400: 0.399, w700: 0.433, x: 0.41, cap: 0.57, serif: 4.56 },
  "Anton": { w400: 0.455, w700: 0.455, x: 0.74, cap: 0.86, serif: 1 },
  "Bebas Neue": { w400: 0.389, w700: 0.389, x: 0.7, cap: 0.7, serif: 1 },
  "Oswald": { w400: 0.4, w700: 0.453, x: 0.59, cap: 0.82, serif: 1 },
  "Big Shoulders": { w400: 0.371, w700: 0.44, x: 0.6, cap: 0.8, serif: 1 },
  "League Gothic": { w400: 0.293, w700: 0.293, x: 0.56, cap: 0.74, serif: 1 },
  "Antonio": { w400: 0.41, w700: 0.438, x: 0.74, cap: 0.86, serif: 1 },
  "Sofia Sans Condensed": { w400: 0.377, w700: 0.402, x: 0.5, cap: 0.67, serif: 1 },
  "Archivo Black": { w400: 0.615, w700: 0.615, x: 0.53, cap: 0.69, serif: 1 },
  "Dela Gothic One": { w400: 0.667, w700: 0.667, x: 0.55, cap: 0.74, serif: 2.52 },
  "Rubik Mono One": { w400: 0.85, w700: 0.85, x: 0.7, cap: 0.7, serif: 2.48 },
  "Bowlby One": { w400: 0.704, w700: 0.704, x: 0.59, cap: 0.76, serif: 1.05 },
  "Titan One": { w400: 0.631, w700: 0.631, x: 0.59, cap: 0.72, serif: 0.77 },
  "Lilita One": { w400: 0.49, w700: 0.49, x: 0.51, cap: 0.71, serif: 1.8 },
  "Bagel Fat One": { w400: 0.525, w700: 0.525, x: 0.53, cap: 0.74, serif: 0.44 },
  "Climate Crisis": { w400: 0.823, w700: 0.823, x: 0.62, cap: 0.75, serif: 1 },
  "Krona One": { w400: 0.736, w700: 0.736, x: 0.59, cap: 0.77, serif: 1 },
  "Michroma": { w400: 0.719, w700: 0.719, x: 0.56, cap: 0.75, serif: 1 },
  "Syncopate": { w400: 0.85, w700: 0.932, x: 0.67, cap: 0.67, serif: 1 },
  "Unna": { w400: 0.456, w700: 0.474, x: 0.42, cap: 0.6, serif: 2.33 },
  "Alfa Slab One": { w400: 0.608, w700: 0.608, x: 0.56, cap: 0.78, serif: 1.36 },
  "Righteous": { w400: 0.522, w700: 0.522, x: 0.53, cap: 0.7, serif: 1 },
  "Shrikhand": { w400: 0.618, w700: 0.618, x: 0.53, cap: 0.67, serif: 1.26 },
  "Instrument Serif": { w400: 0.388, w700: 0.388, x: 0.51, cap: 0.73, serif: 3 },
  "Fraunces": { w400: 0.537, w700: 0.576, x: 0.47, cap: 0.7, serif: 2.26 },
  "Playfair Display": { w400: 0.508, w700: 0.526, x: 0.52, cap: 0.71, serif: 2.83 },
  "DM Serif Display": { w400: 0.513, w700: 0.513, x: 0.49, cap: 0.67, serif: 1.73 },
  "Young Serif": { w400: 0.573, w700: 0.573, x: 0.5, cap: 0.75, serif: 2.09 },
  "Gloock": { w400: 0.517, w700: 0.517, x: 0.51, cap: 0.75, serif: 2.03 },
  "Libre Caslon Display": { w400: 0.41, w700: 0.41, x: 0.42, cap: 0.7, serif: 3 },
  "Bodoni Moda": { w400: 0.531, w700: 0.561, x: 0.46, cap: 0.75, serif: 3.42 },
  "Cormorant": { w400: 0.44, w700: 0.446, x: 0.39, cap: 0.63, serif: 3.69 },
  "EB Garamond": { w400: 0.437, w700: 0.479, x: 0.42, cap: 0.66, serif: 3.75 },
  "Newsreader": { w400: 0.485, w700: 0.527, x: 0.44, cap: 0.68, serif: 2.94 },
  "Literata": { w400: 0.549, w700: 0.591, x: 0.51, cap: 0.7, serif: 2.85 },
  "Source Serif 4": { w400: 0.548, w700: 0.571, x: 0.5, cap: 0.68, serif: 2.86 },
  "Crimson Pro": { w400: 0.459, w700: 0.49, x: 0.42, cap: 0.58, serif: 2.56 },
  "Lora": { w400: 0.526, w700: 0.542, x: 0.51, cap: 0.71, serif: 2.65 },
  "Noto Serif": { w400: 0.549, w700: 0.583, x: 0.54, cap: 0.72, serif: 2.9 },
  "Merriweather": { w400: 0.559, w700: 0.574, x: 0.56, cap: 0.75, serif: 2.68 },
  "Roboto Slab": { w400: 0.546, w700: 0.557, x: 0.54, cap: 0.72, serif: 2.68 },
  "JetBrains Mono": { w400: 0.6, w700: 0.6, x: 0.55, cap: 0.73, serif: 4.33 },
  "IBM Plex Mono": { w400: 0.6, w700: 0.6, x: 0.52, cap: 0.71, serif: 5.38 },
  "Space Mono": { w400: 0.612, w700: 0.612, x: 0.5, cap: 0.7, serif: 5.24 },
  "Geist Mono": { w400: 0.6, w700: 0.6, x: 0.53, cap: 0.71, serif: 4.89 },
  "DM Mono": { w400: 0.6, w700: 0.6, x: 0.5, cap: 0.71, serif: 5 },
  "Fragment Mono": { w400: 0.618, w700: 0.618, x: 0.53, cap: 0.7, serif: 4.11 },
  "Martian Mono": { w400: 0.7, w700: 0.7, x: 0.61, cap: 0.81, serif: 4.64 },
};

export type MeasuredFont = { family: string; weight: number; lower: number; x: number; cap: number; serif: number };

function metricDistance(entry: FontMetrics, target: MeasuredFont, family: string) {
  const t = Math.min(1, Math.max(0, (target.weight - 400) / 300));
  const width = entry.w400 + (entry.w700 - entry.w400) * t;
  const catalogEntry = findCatalogFont(family);
  const catalogSerif = catalogEntry?.category === "serif" || /slab/i.test(family);
  const serifMismatch = catalogSerif !== (target.serif >= 1.8) ? 1.5 : 0;
  return Math.abs(width - target.lower) / 0.05 +
    Math.abs(entry.x - target.x) / 0.04 +
    Math.abs(entry.cap - target.cap) / 0.05 +
    serifMismatch;
}

/** Catalog faces ranked by glyph-metric similarity to a measured reference font. */
export function closestCatalogFonts(target: MeasuredFont, role: FontRole, limit = 4) {
  return FONT_CATALOG
    .filter((entry) => entry.roles.includes(role) || (role === "display" && entry.category !== "mono"))
    .flatMap((entry) => {
      const metrics = FONT_METRICS[entry.family];
      return metrics ? [{ entry, distance: metricDistance(metrics, target, entry.family) }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function catalogFontDistance(family: string, target: MeasuredFont) {
  const metrics = FONT_METRICS[family];
  return metrics ? metricDistance(metrics, target, family) : null;
}
