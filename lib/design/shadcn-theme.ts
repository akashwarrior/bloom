import z from "zod/v4";
import {
  encodePreset,
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONT_HEADINGS,
  PRESET_FONTS,
  PRESET_ICON_LIBRARIES,
  PRESET_MENU_ACCENTS,
  PRESET_MENU_COLORS,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
} from "shadcn/preset";

import { parseOklch, toHex } from "./color.ts";
import { CHART_COLOR_PAIRINGS, ICON_OPTIONS, STYLE_OPTIONS } from "./theme-options.ts";

const STYLE_DESCRIPTION = PRESET_STYLES.map(
  (style) => `${style}: ${STYLE_OPTIONS[style].description}`,
).join("; ");

/**
 * The inputs of shadcn create (ui.shadcn.com/create): Bloom resolves them
 * through shadcn's own init endpoint and applies them with `shadcn apply`.
 */
export const shadcnThemeSchema = z.strictObject({
  style: z.enum(PRESET_STYLES).describe(`Component geometry. ${STYLE_DESCRIPTION}.`),
  baseColor: z.enum(PRESET_BASE_COLORS).describe("Neutral family for backgrounds, borders and muted text."),
  theme: z.enum(PRESET_THEMES).describe("Primary color: buttons, focus rings, key highlights. A neutral name (neutral, stone, zinc, gray, mauve, olive, mist, taupe) is allowed only when it equals baseColor."),
  chartColor: z.enum(PRESET_CHART_COLORS).describe("Palette of chart-1..5, used for charts and chart-role panels. A neutral name is allowed only when it equals baseColor."),
  font: z.enum(PRESET_FONTS).describe("Body font."),
  fontHeading: z.enum(PRESET_FONT_HEADINGS).describe("Heading font; inherit uses the body font."),
  iconLibrary: z.enum(PRESET_ICON_LIBRARIES),
  radius: z.enum(PRESET_RADII),
  mode: z.enum(["light", "dark"]).describe("Which side of the theme the page uses."),
  menuAccent: z.enum(PRESET_MENU_ACCENTS).default("subtle").describe("Menu focus treatment: subtle uses the muted surface, bold uses the primary color."),
  menuColor: z.enum(PRESET_MENU_COLORS).default("default").describe("Menu surface: default follows the page popover, inverted forces the dark popover, and the translucent variants add a backdrop blur."),
});

export type ShadcnTheme = z.infer<typeof shadcnThemeSchema>;

const pick = <T>(items: readonly T[], random: () => number) => items[Math.floor(random() * items.length)]!;

const isBaseColor = (name: string) => (PRESET_BASE_COLORS as readonly string[]).includes(name);

/** shadcn create's rule: a neutral name works as theme or chart color only on its own base color. */
export function themesForBaseColor(baseColor: ShadcnTheme["baseColor"]) {
  return PRESET_THEMES.filter((name) => name === baseColor || !isBaseColor(name));
}

export function chartColorsForBaseColor(baseColor: ShadcnTheme["baseColor"]) {
  return PRESET_CHART_COLORS.filter((name) => name === baseColor || !isBaseColor(name));
}

/**
 * Replaces a theme or chart color the base color does not offer (shadcn init
 * rejects it with a 400) with the base color's own neutral.
 */
export function compatibleShadcnTheme(theme: ShadcnTheme) {
  const notes: string[] = [];
  let next = theme;
  if (!themesForBaseColor(theme.baseColor).includes(theme.theme)) {
    notes.push(`Theme "${theme.theme}" is not available on base color "${theme.baseColor}"; Bloom used "${theme.baseColor}".`);
    next = { ...next, theme: theme.baseColor };
  }
  if (!chartColorsForBaseColor(theme.baseColor).includes(theme.chartColor)) {
    notes.push(`Chart color "${theme.chartColor}" is not available on base color "${theme.baseColor}"; Bloom used "${theme.baseColor}".`);
    next = { ...next, chartColor: theme.baseColor };
  }
  if (theme.style === "rhea" && theme.radius === "large") {
    notes.push("Rhea does not support the large radius; Bloom used medium.");
    next = { ...next, radius: "medium" };
  }
  return { theme: next, notes };
}

/** A random preset with shadcn create's own randomize biases (create's Shuffle button). */
export function randomShadcnTheme(random: () => number = Math.random): ShadcnTheme {
  const style = pick(PRESET_STYLES, random);
  const baseColor = pick(PRESET_BASE_COLORS.filter((color) => color !== "gray"), random);
  const theme = pick(themesForBaseColor(baseColor), random);
  const font = style === "lyra" ? "jetbrains-mono" : pick(PRESET_FONTS, random);
  const radii = style === "lyra" ? ["none"] as const : PRESET_RADII.filter((radius) => style !== "rhea" || radius !== "large");
  const pairing = CHART_COLOR_PAIRINGS[theme];
  return {
    style,
    baseColor,
    theme,
    chartColor: pairing ? pick(pairing, random) as ShadcnTheme["chartColor"] : pick(chartColorsForBaseColor(baseColor), random),
    font,
    fontHeading: pick(PRESET_FONT_HEADINGS, random),
    iconLibrary: pick(PRESET_ICON_LIBRARIES, random),
    radius: pick(radii, random),
    mode: "light",
    menuAccent: pick(PRESET_MENU_ACCENTS, random),
    menuColor: pick(PRESET_MENU_COLORS, random),
  };
}

export function shadcnPresetCode(theme: ShadcnTheme) {
  return encodePreset({
    style: theme.style,
    baseColor: theme.baseColor,
    theme: theme.theme,
    chartColor: theme.chartColor,
    font: theme.font,
    fontHeading: theme.fontHeading,
    iconLibrary: theme.iconLibrary,
    radius: theme.radius,
    menuAccent: theme.menuAccent,
    menuColor: theme.menuColor,
  });
}

const RADIUS_PX: Record<string, number> = { none: 0, small: 7, medium: 10, large: 14, default: 10 };

/** The resolved tokens of an applied preset, stored so they survive a reload. */
export const resolvedShadcnThemeSchema = z.strictObject({
  code: z.string(),
  /** CSS color values of the chosen mode, keyed like shadcn's CSS variables. */
  vars: z.record(z.string(), z.string()),
  /** CSS color values of shadcn's dark side; the dark block also powers inverted menus. */
  darkVars: z.record(z.string(), z.string()),
  radiusPx: z.number().int().nonnegative(),
  chart: z.array(z.string()).length(5),
  /** Package installed by shadcn apply for the chosen icon library. */
  iconPackage: z.string(),
});

export type ResolvedShadcnTheme = z.infer<typeof resolvedShadcnThemeSchema>;

/** The normalized inputs and resolved tokens of an applied or previewed preset. */
export type ResolvedPreset = {
  input: ShadcnTheme;
  resolved: ResolvedShadcnTheme;
};

/** Converts shadcn's oklch values to a CSS color, preserving alpha in translucent tokens. */
function cssColor(value: string) {
  const color = parseOklch(value);
  if (!color) return null;
  const alpha = /\/\s*(\d*\.?\d+)(%?)\s*\)$/.exec(value);
  if (alpha) {
    const percent = alpha[2] === "%" ? Number.parseFloat(alpha[1]!) : Number.parseFloat(alpha[1]!) * 100;
    if (percent < 100) {
      return `rgb(${color.r} ${color.g} ${color.b} / ${Math.round(percent * 100) / 100}%)`;
    }
  }
  return toHex(color);
}

function cssVars(values: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(values ?? {}).flatMap(([key, value]) => {
      const color = cssColor(value);
      return color ? [[key, color]] : [];
    }),
  );
}

const REQUIRED_VARS = ["background", "foreground", "primary", "primary-foreground", "muted", "muted-foreground", "border", "accent", "accent-foreground", "chart-1", "chart-3"] as const;

/** Resolves a preset through shadcn's init endpoint, the same source `shadcn apply` reads. */
export async function resolveShadcnTheme(theme: ShadcnTheme, signal?: AbortSignal): Promise<ResolvedShadcnTheme> {
  const params = new URLSearchParams({
    base: "base",
    style: theme.style,
    baseColor: theme.baseColor,
    theme: theme.theme,
    chartColor: theme.chartColor,
    iconLibrary: theme.iconLibrary,
    font: theme.font,
    fontHeading: theme.fontHeading,
    rtl: "false",
    menuAccent: theme.menuAccent,
    menuColor: theme.menuColor,
    radius: theme.radius,
  });
  const response = await fetch(`https://ui.shadcn.com/init?${params}`, { signal });
  if (!response.ok) {
    const detail = await response.json().then((body: { error?: string }) => body.error).catch(() => null);
    throw new Error(`shadcn init returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const item = await response.json() as { cssVars?: { light?: Record<string, string>; dark?: Record<string, string> } };
  const lightVars = cssVars(item.cssVars?.light);
  const darkVars = cssVars(item.cssVars?.dark);
  const vars = theme.mode === "dark" ? { ...lightVars, ...darkVars } : lightVars;
  for (const key of REQUIRED_VARS) {
    if (!vars[key]) throw new Error(`shadcn init returned no ${key} color`);
  }
  if (Object.keys(darkVars).length === 0) throw new Error("shadcn init returned no dark colors");
  const rawRadius = item.cssVars?.light?.radius ?? item.cssVars?.dark?.radius;
  const radiusPx = rawRadius?.endsWith("rem")
    ? Math.round(Number.parseFloat(rawRadius) * 16)
    : RADIUS_PX[theme.radius]!;
  return {
    code: shadcnPresetCode(theme),
    vars,
    darkVars,
    radiusPx: theme.radius === "none" ? 0 : radiusPx,
    chart: [1, 2, 3, 4, 5].map((index) => vars[`chart-${index}`] ?? vars["chart-3"]!),
    iconPackage: ICON_OPTIONS[theme.iconLibrary].package,
  };
}

/** Normalizes a preset and resolves it, returning the notes for anything changed. */
export async function prepareShadcnTheme(input: ShadcnTheme, signal?: AbortSignal) {
  const { theme, notes } = compatibleShadcnTheme(input);
  return { theme, resolved: await resolveShadcnTheme(theme, signal), notes };
}

