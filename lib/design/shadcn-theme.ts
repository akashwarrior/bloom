import z from "zod/v4";
import {
  encodePreset,
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONT_HEADINGS,
  PRESET_FONTS,
  PRESET_ICON_LIBRARIES,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
} from "shadcn/preset";

import type { DesignBrief, ThemedBrief } from "./brief.ts";
import { contrastRatio, isLightColor, parseColor, parseOklch, toHex } from "./color.ts";

/**
 * The inputs of shadcn create (ui.shadcn.com/create): Bloom resolves them
 * through shadcn's own init endpoint and applies them with `shadcn apply`.
 */
export const shadcnThemeSchema = z.strictObject({
  style: z.enum(PRESET_STYLES).describe("vega: clean, neutral, familiar. nova: reduced padding and margins. maia: rounded, generous spacing. lyra: boxy and sharp, for mono fonts. mira: compact interfaces. luma: fluid, luminous, soft. sera: editorial and typographic. rhea: like luma but compact."),
  baseColor: z.enum(PRESET_BASE_COLORS).describe("Neutral family for backgrounds, borders and muted text."),
  theme: z.enum(PRESET_THEMES).describe("Primary color: buttons, focus rings, key highlights. A neutral name (neutral, stone, zinc, gray, mauve, olive, mist, taupe) is allowed only when it equals baseColor."),
  chartColor: z.enum(PRESET_CHART_COLORS).describe("Palette of chart-1..5, also the art and accent hues. A neutral name is allowed only when it equals baseColor."),
  font: z.enum(PRESET_FONTS).describe("Body font."),
  fontHeading: z.enum(PRESET_FONT_HEADINGS).describe("Heading font; inherit uses the body font."),
  iconLibrary: z.enum(PRESET_ICON_LIBRARIES),
  radius: z.enum(PRESET_RADII),
  mode: z.enum(["light", "dark"]).describe("Which side of the theme the page uses."),
});

export type ShadcnTheme = z.infer<typeof shadcnThemeSchema>;

const CHART_PAIRINGS: Record<string, string[]> = {
  red: ["teal", "sky"],
  orange: ["teal", "blue"],
  amber: ["cyan", "indigo"],
  yellow: ["sky", "violet"],
  lime: ["indigo", "pink"],
  green: ["purple", "rose"],
  emerald: ["purple", "red"],
  teal: ["fuchsia", "red"],
  cyan: ["rose", "amber"],
  sky: ["red", "yellow"],
  blue: ["orange", "yellow"],
  indigo: ["amber", "yellow"],
  violet: ["yellow", "lime"],
  purple: ["green", "lime"],
  fuchsia: ["lime", "teal"],
  pink: ["green", "cyan"],
  rose: ["emerald", "sky"],
};

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
  return { theme: next, notes };
}

/** A random preset with shadcn create's own randomize biases (create's Shuffle button). */
export function randomShadcnTheme(random: () => number = Math.random): ShadcnTheme {
  const style = pick(PRESET_STYLES, random);
  const baseColor = pick(PRESET_BASE_COLORS.filter((color) => color !== "gray"), random);
  const theme = pick(themesForBaseColor(baseColor), random);
  const font = style === "lyra" ? "jetbrains-mono" : pick(PRESET_FONTS, random);
  const radii = style === "lyra" ? ["none"] as const : PRESET_RADII.filter((radius) => style !== "rhea" || radius !== "large");
  const pairing = CHART_PAIRINGS[theme];
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
    menuAccent: "subtle",
    menuColor: "default",
  });
}

const FONT_FAMILIES: Record<string, string> = {
  "noto-sans": "Noto Sans",
  "nunito-sans": "Nunito Sans",
  "dm-sans": "DM Sans",
  "public-sans": "Public Sans",
  "jetbrains-mono": "JetBrains Mono",
  "geist-mono": "Geist Mono",
  "playfair-display": "Playfair Display",
  "noto-serif": "Noto Serif",
  "roboto-slab": "Roboto Slab",
  "space-grotesk": "Space Grotesk",
  "ibm-plex-sans": "IBM Plex Sans",
  "source-sans-3": "Source Sans 3",
  "instrument-sans": "Instrument Sans",
  "eb-garamond": "EB Garamond",
  "instrument-serif": "Instrument Serif",
};

export function shadcnFontFamily(id: string) {
  return FONT_FAMILIES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

const RADIUS_PX: Record<string, number> = { none: 0, small: 7, medium: 10, large: 14, default: 10 };

export type ResolvedShadcnTheme = {
  code: string;
  /** Hex values of the chosen mode, keyed like shadcn's CSS variables. */
  vars: Record<string, string>;
  radiusPx: number;
  chart: string[];
  iconImport: string;
};

const ICON_IMPORTS: Record<string, string> = {
  lucide: 'import { ArrowRight } from "lucide-react"',
  tabler: 'import { IconArrowRight } from "@tabler/icons-react"',
  phosphor: 'import { ArrowRightIcon } from "@phosphor-icons/react"',
  remixicon: 'import { RiArrowRightLine } from "@remixicon/react"',
  hugeicons: 'import { HugeiconsIcon } from "@hugeicons/react"; import { ArrowRight01Icon } from "@hugeicons/core-free-icons"; <HugeiconsIcon icon={ArrowRight01Icon} />',
};

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
    menuAccent: "subtle",
    menuColor: "default",
    radius: theme.radius,
  });
  const response = await fetch(`https://ui.shadcn.com/init?${params}`, { signal });
  if (!response.ok) {
    const detail = await response.json().then((body: { error?: string }) => body.error).catch(() => null);
    throw new Error(`shadcn init returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const item = await response.json() as { cssVars?: { light?: Record<string, string>; dark?: Record<string, string> } };
  const raw = { ...item.cssVars?.light, ...(theme.mode === "dark" ? item.cssVars?.dark : {}) };
  const vars = Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const color = parseOklch(value);
      return color ? [[key, toHex(color)]] : [];
    }),
  );
  for (const key of ["background", "foreground", "primary", "primary-foreground", "muted", "muted-foreground", "border", "chart-1", "chart-3"]) {
    if (!vars[key]) throw new Error(`shadcn init returned no ${key} color`);
  }
  const radius = raw.radius?.endsWith("rem") ? Math.round(Number.parseFloat(raw.radius) * 16) : RADIUS_PX[theme.radius]!;
  return {
    code: shadcnPresetCode(theme),
    vars,
    radiusPx: theme.radius === "none" ? 0 : radius,
    chart: [1, 2, 3, 4, 5].map((index) => vars[`chart-${index}`] ?? vars["chart-3"]!),
    iconImport: ICON_IMPORTS[theme.iconLibrary]!,
  };
}

function readableOn(background: string, candidates: string[]) {
  const bg = parseColor(background)!;
  return candidates.reduce((best, candidate) =>
    contrastRatio(parseColor(candidate)!, bg) > contrastRatio(parseColor(best)!, bg) ? candidate : best);
}

const MONO_FONTS = new Set(["jetbrains-mono", "geist-mono"]);

/** Expands a themed brief into the full brief: colors, fonts and shape come from the resolved shadcn theme. */
export function briefFromTheme(input: ThemedBrief, resolved: ResolvedShadcnTheme): DesignBrief {
  const { shadcn, surfaces, typography, ...rest } = input;
  const vars = resolved.vars;
  const accent = resolved.chart[2]!;
  const onAccent = readableOn(accent, ["#FFFFFF", "#111111", vars.foreground!, vars.background!]);
  const surfaceColors = {
    background: [vars.background!, vars.foreground!],
    muted: [vars.muted!, vars.foreground!],
    primary: [vars.primary!, vars["primary-foreground"]!],
    inverse: [vars.foreground!, vars.background!],
    chart: [accent, onAccent],
  } satisfies Record<ThemedBrief["surfaces"][number]["role"], string[]>;
  const resolvedSurfaces = surfaces.map((surface) => ({
    name: surface.name,
    background: surfaceColors[surface.role][0]!,
    foreground: surfaceColors[surface.role][1]!,
  }));
  const tones = new Set(resolvedSurfaces.map((surface) => isLightColor(parseColor(surface.background)!)));
  const heading = shadcn.fontHeading === "inherit" ? shadcn.font : shadcn.fontHeading;
  const mono = [shadcn.font, heading].find((font) => MONO_FONTS.has(font));
  return {
    ...rest,
    theme: tones.size > 1 ? "mixed" : shadcn.mode,
    colors: {
      background: vars.background!,
      foreground: vars.foreground!,
      primary: vars.primary!,
      primaryForeground: vars["primary-foreground"]!,
      accent,
      accentForeground: onAccent,
      muted: vars.muted!,
      mutedForeground: vars["muted-foreground"]!,
      border: vars.border!,
      surfaces: resolvedSurfaces,
    },
    typography: {
      display: { family: shadcnFontFamily(heading), ...typography.display },
      heading: typography.heading,
      body: { family: shadcnFontFamily(shadcn.font), ...typography.body },
      mono: mono ? { family: shadcnFontFamily(mono) } : null,
    },
    shape: {
      cardRadiusPx: Math.min(resolved.radiusPx * 2, 32),
      buttonShape: resolved.radiusPx === 0 ? "square" : "rounded",
      shadows: "subtle",
      borders: true,
    },
  };
}
