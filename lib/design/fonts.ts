type FontCategory = "sans" | "serif" | "display" | "mono";
type FontWidth = "condensed" | "normal" | "wide";
type FontRole = "display" | "body" | "mono";

type CatalogFont = {
  family: string;
  category: FontCategory;
  width: FontWidth;
  roles: FontRole[];
  /** Static weights available from next/font/google; empty for variable fonts. */
  weights: string[];
  variable: boolean;
};

const font = (
  family: string,
  category: FontCategory,
  width: FontWidth,
  roles: FontRole[],
  weights: string[] | "variable",
): CatalogFont => ({
  family,
  category,
  width,
  roles,
  weights: weights === "variable" ? [] : weights,
  variable: weights === "variable",
});

/**
 * Curated Google fonts verified against the runtime's next/font catalog.
 * Every entry renders through next/font/google without extra configuration.
 */
export const FONT_CATALOG: CatalogFont[] = [
  font("Bricolage Grotesque", "sans", "normal", ["display", "body"], "variable"),
  font("Space Grotesk", "sans", "normal", ["display", "body"], "variable"),
  font("Syne", "display", "wide", ["display"], "variable"),
  font("Unbounded", "display", "wide", ["display"], "variable"),
  font("Familjen Grotesk", "sans", "normal", ["display", "body"], "variable"),
  font("Schibsted Grotesk", "sans", "normal", ["display", "body"], "variable"),
  font("Instrument Sans", "sans", "normal", ["display", "body"], "variable"),
  font("Hanken Grotesk", "sans", "normal", ["display", "body"], "variable"),
  font("Host Grotesk", "sans", "normal", ["display", "body"], "variable"),
  font("Funnel Display", "display", "normal", ["display"], "variable"),
  font("Funnel Sans", "sans", "normal", ["body"], "variable"),
  font("Gabarito", "sans", "normal", ["display", "body"], "variable"),
  font("Mona Sans", "sans", "normal", ["display", "body"], "variable"),
  font("Hubot Sans", "sans", "normal", ["display"], "variable"),
  font("Archivo", "sans", "normal", ["display", "body"], "variable"),
  font("Red Hat Display", "sans", "normal", ["display"], "variable"),
  font("Sora", "sans", "normal", ["display", "body"], "variable"),
  font("Outfit", "sans", "normal", ["display", "body"], "variable"),
  font("Urbanist", "sans", "normal", ["display", "body"], "variable"),
  font("Plus Jakarta Sans", "sans", "normal", ["display", "body"], "variable"),
  font("Manrope", "sans", "normal", ["display", "body"], "variable"),
  font("DM Sans", "sans", "normal", ["body", "display"], "variable"),
  font("Figtree", "sans", "normal", ["body"], "variable"),
  font("Onest", "sans", "normal", ["body"], "variable"),
  font("Geist", "sans", "normal", ["body"], "variable"),
  font("Rethink Sans", "sans", "normal", ["body", "display"], "variable"),
  font("Albert Sans", "sans", "normal", ["body", "display"], "variable"),
  font("Epilogue", "sans", "normal", ["display", "body"], "variable"),
  font("Inter Tight", "sans", "normal", ["display"], "variable"),
  font("Wix Madefor Display", "sans", "normal", ["display"], "variable"),
  font("Wix Madefor Text", "sans", "normal", ["body"], "variable"),
  font("Inter", "sans", "normal", ["body"], "variable"),
  font("IBM Plex Sans", "sans", "normal", ["body", "display"], "variable"),
  font("Public Sans", "sans", "normal", ["body"], "variable"),
  font("Noto Sans", "sans", "normal", ["body"], "variable"),
  font("Nunito Sans", "sans", "normal", ["display", "body"], "variable"),
  font("Roboto", "sans", "normal", ["body"], "variable"),
  font("Raleway", "sans", "normal", ["display", "body"], "variable"),
  font("Montserrat", "sans", "normal", ["display", "body"], "variable"),
  font("Source Sans 3", "sans", "normal", ["body"], "variable"),
  font("Oxanium", "display", "normal", ["display"], "variable"),
  font("Work Sans", "sans", "normal", ["body", "display"], "variable"),
  font("Rubik", "sans", "normal", ["display", "body"], "variable"),
  font("Geologica", "sans", "normal", ["display", "body"], "variable"),
  font("Chivo", "sans", "normal", ["display", "body"], "variable"),
  font("Darker Grotesque", "display", "condensed", ["display"], "variable"),
  font("Anton", "display", "condensed", ["display"], ["400"]),
  font("Bebas Neue", "display", "condensed", ["display"], ["400"]),
  font("Oswald", "display", "condensed", ["display"], "variable"),
  font("Big Shoulders", "display", "condensed", ["display"], "variable"),
  font("League Gothic", "display", "condensed", ["display"], "variable"),
  font("Antonio", "display", "condensed", ["display"], "variable"),
  font("Sofia Sans Condensed", "display", "condensed", ["display", "body"], "variable"),
  font("Archivo Black", "display", "normal", ["display"], ["400"]),
  font("Dela Gothic One", "display", "wide", ["display"], ["400"]),
  font("Rubik Mono One", "display", "wide", ["display"], ["400"]),
  font("Bowlby One", "display", "normal", ["display"], ["400"]),
  font("Titan One", "display", "normal", ["display"], ["400"]),
  font("Lilita One", "display", "normal", ["display"], ["400"]),
  font("Bagel Fat One", "display", "wide", ["display"], ["400"]),
  font("Climate Crisis", "display", "wide", ["display"], "variable"),
  font("Krona One", "display", "wide", ["display"], ["400"]),
  font("Michroma", "display", "wide", ["display"], ["400"]),
  font("Syncopate", "display", "wide", ["display"], ["400", "700"]),
  font("Unna", "serif", "normal", ["display"], ["400", "700"]),
  font("Alfa Slab One", "display", "normal", ["display"], ["400"]),
  font("Righteous", "display", "normal", ["display"], ["400"]),
  font("Shrikhand", "display", "normal", ["display"], ["400"]),
  font("Instrument Serif", "serif", "condensed", ["display"], ["400"]),
  font("Fraunces", "serif", "normal", ["display", "body"], "variable"),
  font("Playfair Display", "serif", "normal", ["display"], "variable"),
  font("DM Serif Display", "serif", "normal", ["display"], ["400"]),
  font("Young Serif", "serif", "normal", ["display"], ["400"]),
  font("Gloock", "serif", "normal", ["display"], ["400"]),
  font("Libre Caslon Display", "serif", "normal", ["display"], ["400"]),
  font("Bodoni Moda", "serif", "normal", ["display"], "variable"),
  font("Cormorant", "serif", "normal", ["display"], "variable"),
  font("EB Garamond", "serif", "normal", ["body", "display"], "variable"),
  font("Newsreader", "serif", "normal", ["body", "display"], "variable"),
  font("Literata", "serif", "normal", ["body"], "variable"),
  font("Source Serif 4", "serif", "normal", ["body", "display"], "variable"),
  font("Crimson Pro", "serif", "normal", ["body"], "variable"),
  font("Lora", "serif", "normal", ["body"], "variable"),
  font("Noto Serif", "serif", "normal", ["display", "body"], "variable"),
  font("Merriweather", "serif", "normal", ["display", "body"], "variable"),
  font("Roboto Slab", "serif", "normal", ["display", "body"], "variable"),
  font("JetBrains Mono", "mono", "normal", ["mono"], "variable"),
  font("IBM Plex Mono", "mono", "normal", ["mono"], ["300", "400", "500", "600", "700"]),
  font("Space Mono", "mono", "normal", ["mono", "display"], ["400", "700"]),
  font("Geist Mono", "mono", "normal", ["mono"], "variable"),
  font("DM Mono", "mono", "normal", ["mono"], ["300", "400", "500"]),
  font("Fragment Mono", "mono", "normal", ["mono"], ["400"]),
  font("Martian Mono", "mono", "wide", ["mono", "display"], "variable"),
];

const BY_FAMILY = new Map(
  FONT_CATALOG.map((entry) => [entry.family.toLowerCase(), entry]),
);

export function findCatalogFont(family: string) {
  return BY_FAMILY.get(family.trim().toLowerCase()) ?? null;
}

/**
 * Glyph metrics measured in Chromium at 100px: average lowercase advance width
 * (em) at 400 and 700, x-height and cap height (em), and the foot/stem width
 * ratio of a capital I (above ~1.8 indicates serifs or slab terminals).
 */
type FontMetrics = { w400: number; w700: number; x: number; cap: number; serif: number };

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
